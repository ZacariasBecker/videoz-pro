import { Component, ChangeDetectorRef, OnInit, ViewChild, ElementRef, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { DomSanitizer, SafeUrl } from '@angular/platform-browser';

interface VideoItem {
  fileName: string;
  music: string;
  artist: string;
  thumbnailUrl: SafeUrl | string;
  videoUrl: SafeUrl | string;
  isEditing: boolean;
  marks: string[];
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './app.html',
  styleUrls: ['./app.css']
})
export class App implements OnInit {
  folderPath: string = '';
  errorMessage: string = '';
  videos: VideoItem[] = [];
  
  currentVideo: VideoItem | null = null;
  videoDuration: number = 0;
  playbackSpeed: number = 1;

  @ViewChild('videoPlayer') videoPlayerRef!: ElementRef<HTMLVideoElement>;

  constructor(private cdr: ChangeDetectorRef, private sanitizer: DomSanitizer) {}

  ngOnInit() {
    this.loadDefaultFolder();
  }

  @HostListener('window:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if (!this.currentVideo) return;

    const activeElement = document.activeElement;
    if (activeElement && activeElement.tagName === 'INPUT') {
      return;
    }

    if (event.code === 'Space') {
      event.preventDefault();
      if (this.videoPlayerRef) {
        const videoEl = this.videoPlayerRef.nativeElement;
        if (videoEl.paused) {
          videoEl.play();
        } else {
          videoEl.pause();
        }
      }
      return;
    }

    const keyMatch = event.code.match(/^(?:Digit|Numpad)([0-9])$/);
    if (keyMatch) {
      const index = parseInt(keyMatch[1], 10);
      if (index >= 0 && index <= 9 && this.currentVideo.marks[index]) {
        event.preventDefault();
        this.jumpToMark(this.currentVideo.marks[index]);
      }
    }
  }

  async loadDefaultFolder() {
    if ((window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      const result = await ipcRenderer.invoke('app:loadDefaultFolder');
      
      if (result && result.success) {
        this.folderPath = result.folderPath;
        await this.processVideoFiles(result.files);
        this.errorMessage = '';
      } else {
        this.errorMessage = result.error || 'Ocorreu um erro ao carregar a pasta padrão.';
      }
      this.cdr.detectChanges();
    }
  }

  async selectFolder() {
    if ((window as any).require) {
      const { ipcRenderer } = (window as any).require('electron');
      const result = await ipcRenderer.invoke('dialog:openFolder');
      
      if (result && !result.canceled) {
        this.folderPath = result.folderPath;
        this.closePlayer();
        await this.processVideoFiles(result.files);
        this.errorMessage = '';
        this.cdr.detectChanges();
      }
    } else {
      alert('Este recurso só funciona rodando pelo Electron!');
    }
  }

  async processVideoFiles(fileNames: string[]) {
    this.videos = [];
    let savedData: { [key: string]: { music?: string; artist?: string; marks?: string[] } } = {};

    if ((window as any).require) {
      const fs = (window as any).require('fs');
      const configPath = `${this.folderPath}\\videoz-config.json`;
      
      try {
        if (fs.existsSync(configPath)) {
          const fileContent = fs.readFileSync(configPath, 'utf8');
          savedData = JSON.parse(fileContent);
        }
      } catch (err) {
        console.error("Erro ao ler o arquivo de configuração:", err);
      }
    }

    for (const fileName of fileNames) {
      const fullPath = `${this.folderPath}\\${fileName}`;
      const normalizedPath = fullPath.replace(/\\/g, '/');
      const fileUrl = `file:///${normalizedPath}`;
      const safeVideoUrl = this.sanitizer.bypassSecurityTrustUrl(fileUrl);

      const cleanName = fileName.replace(/\.[^/.]+$/, "");
      let defaultMusic = cleanName;
      let defaultArtist = "Desconhecido";

      if (cleanName.includes(" - ")) {
        const parts = cleanName.split(" - ");
        defaultArtist = parts[0].trim();
        defaultMusic = parts.slice(1).join(" - ").trim();
      }

      const videoConfig = savedData[fileName] || {};
      const music = videoConfig.music !== undefined ? videoConfig.music : defaultMusic;
      const artist = videoConfig.artist !== undefined ? videoConfig.artist : defaultArtist;
      const marks = videoConfig.marks && Array.isArray(videoConfig.marks) && videoConfig.marks.length === 10 
                    ? videoConfig.marks 
                    : Array(10).fill('00:00');

      const videoItem: VideoItem = {
        fileName: fileName,
        music: music,
        artist: artist,
        thumbnailUrl: '',
        videoUrl: safeVideoUrl,
        isEditing: false,
        marks: marks
      };

      this.generateThumbnail(fileUrl, videoItem);
      this.videos.push(videoItem);
    }
  }

  generateThumbnail(videoUrl: string, item: VideoItem) {
    const video = document.createElement('video');
    video.src = videoUrl;
    video.crossOrigin = 'anonymous';
    video.muted = true;
    video.preload = 'metadata';

    video.addEventListener('loadedmetadata', () => {
      video.currentTime = video.duration / 2;
    });

    video.addEventListener('seeked', () => {
      const canvas = document.createElement('canvas');
      canvas.width = 160;
      canvas.height = 90;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        canvas.toBlob((blob) => {
          if (blob) {
            const blobUrl = URL.createObjectURL(blob);
            item.thumbnailUrl = this.sanitizer.bypassSecurityTrustUrl(blobUrl);
            this.cdr.detectChanges();
          }
        }, 'image/jpeg', 0.75);
      }
    });
  }

  toggleEdit(video: VideoItem, event: Event) {
    event.stopPropagation();
    video.isEditing = !video.isEditing;
    
    if (!video.isEditing) {
      this.saveConfigToJson();
    }
    
    this.cdr.detectChanges();
  }

  playVideo(item: VideoItem) {
    this.currentVideo = item;
    this.playbackSpeed = 1;
    this.cdr.detectChanges();
  }

  closePlayer() {
    this.saveConfigToJson();
    this.currentVideo = null;
    this.cdr.detectChanges();
  }

  onMetadataLoaded(event: Event) {
    const videoElement = event.target as HTMLVideoElement;
    this.videoDuration = videoElement.duration;
    videoElement.playbackRate = this.playbackSpeed;
  }

  setPlaybackSpeed(speed: number) {
    this.playbackSpeed = speed;
    if (this.videoPlayerRef) {
      this.videoPlayerRef.nativeElement.playbackRate = speed;
    }
    this.cdr.detectChanges();
  }

  trackByIndex(index: number, item: any): number {
    return index;
  }

  validateMark(index: number) {
    if (!this.currentVideo) return;
    let val = (this.currentVideo.marks[index] || '').trim();
    let totalSeconds = 0;

    if (val.includes(':')) {
      const parts = val.split(':');
      const mins = parseInt(parts[0], 10) || 0;
      const secs = parseInt(parts[1], 10) || 0;
      totalSeconds = mins * 60 + secs;
    } else {
      totalSeconds = parseFloat(val) || 0;
    }

    if (totalSeconds < 0 || isNaN(totalSeconds)) {
      totalSeconds = 0;
    } else if (totalSeconds > this.videoDuration) {
      totalSeconds = this.videoDuration;
    }

    const m = Math.floor(totalSeconds / 60);
    const s = Math.floor(totalSeconds % 60);
    
    this.currentVideo.marks[index] = `${m.toString().padStart(2, '0').slice(-2)}:${s.toString().padStart(2, '0')}`;
    
    this.saveConfigToJson();
    this.cdr.detectChanges();
  }

  jumpToMark(markValue: string) {
    if (!this.videoPlayerRef) return;
    const parts = markValue.split(':');
    const mins = parseInt(parts[0], 10) || 0;
    const secs = parseInt(parts[1], 10) || 0;
    const totalSeconds = mins * 60 + secs;

    const videoEl = this.videoPlayerRef.nativeElement;
    const wasPlaying = !videoEl.paused;

    videoEl.currentTime = totalSeconds;

    if (wasPlaying) {
      videoEl.play();
    } else {
      videoEl.pause();
    }
  }

  saveConfigToJson() {
    if (!this.folderPath || !(window as any).require) return;
    const fs = (window as any).require('fs');
    const configPath = `${this.folderPath}\\videoz-config.json`;

    const configData: { [key: string]: any } = {};
    for (const v of this.videos) {
      configData[v.fileName] = {
        music: v.music,
        artist: v.artist,
        marks: v.marks
      };
    }

    try {
      fs.writeFileSync(configPath, JSON.stringify(configData, null, 2), 'utf8');
    } catch (err) {
      console.error("Erro ao salvar o arquivo de configuração:", err);
    }
  }
}