const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 720,
        title: 'Videoz Pro',
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
            webSecurity: false // Permite carregar recursos locais diretamente sem bloqueio de segurança
        }
    });

    const isDev = process.argv.includes('--dev');

    if (isDev) {
        mainWindow.loadURL('http://localhost:4200');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, 'dist/videoz-pro/browser/index.html'));
    }
}

app.whenReady().then(() => {
    createWindow();

    app.on('activate', function () {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', function () {
    if (process.platform !== 'darwin') app.quit();
});

// Lê a pasta padrão no Windows ao iniciar
ipcMain.handle('app:loadDefaultFolder', () => {
    const defaultPath = 'D:\\Videoz Pro - videos';

    try {
        if (!fs.existsSync(defaultPath)) {
            return { success: false, error: 'A pasta padrão não foi encontrada no disco D. Verifique o caminho.' };
        }

        const allFiles = fs.readdirSync(defaultPath);
        const mp4Files = allFiles.filter(file => file.toLowerCase().endsWith('.mp4'));

        return {
            success: true,
            folderPath: defaultPath,
            files: mp4Files
        };
    } catch (error) {
        console.error("Erro ao ler a pasta padrão:", error);
        return { success: false, error: error.message };
    }
});

// Selecionar outra pasta manualmente
ipcMain.handle('dialog:openFolder', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
        properties: ['openDirectory'],
        title: 'Selecione a pasta com seus vídeos',
        defaultPath: 'D:\\Videoz Pro - videos'
    });

    if (result.canceled) {
        return { canceled: true };
    }

    const folderPath = result.filePaths[0];

    try {
        const allFiles = fs.readdirSync(folderPath);
        const mp4Files = allFiles.filter(file => file.toLowerCase().endsWith('.mp4'));

        return {
            canceled: false,
            folderPath: folderPath,
            files: mp4Files
        };
    } catch (error) {
        console.error("Erro ao ler a pasta:", error);
        return { canceled: true, error: error.message };
    }
});