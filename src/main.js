import { app, BrowserWindow, ipcMain, dialog, nativeImage } from 'electron';
import path from 'node:path';
import started from 'electron-squirrel-startup';

// Import Backend Scripts
import { detectProjectType } from './backend/loader.js';
import { scanApiRoutes, scanSpecificFiles } from './backend/scanner.js';
import { detectParameters } from './backend/parameters.js';
import { sendRequest } from './backend/post.js';
import { aiScanStructure, aiDetectParams } from './backend/aiScanner.js';

if (started) {
  app.quit();
}

const createWindow = () => {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'icon.png')
    : path.join(app.getAppPath(), 'src/assets/images/icon.png');

  const appIcon = nativeImage.createFromPath(iconPath);

  const mainWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    icon: appIcon,
    title: "APIxray",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      devTools: false
    },
  });
  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }

  // Prevent inspect element keyboard shortcuts
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      event.preventDefault();
    }
    if (input.key === 'F12') {
      event.preventDefault();
    }
  });
};

app.whenReady().then(() => {
  ipcMain.handle('dialog:openDirectory', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openDirectory']
    });
    if (canceled) {
      return null;
    } else {
      return filePaths[0];
    }
  });

  ipcMain.handle('api:detectProject', async (event, projectPath) => {
    return detectProjectType(projectPath);
  });

  ipcMain.handle('api:scanRoutes', async (event, projectPath, type) => {
    return scanApiRoutes(projectPath, type);
  });

  ipcMain.handle('api:detectParams', async (event, filePath, method, type) => {
    return detectParameters(filePath, method, type);
  });

  // --- AI SCANNER IPC ---
  ipcMain.handle('api:aiScanStructure', async (event, projectPath, apiKey) => {
    return await aiScanStructure(projectPath, apiKey);
  });

  ipcMain.handle('api:scanSpecificFiles', async (event, projectPath, files, type) => {
    return scanSpecificFiles(projectPath, files, type);
  });

  ipcMain.handle('api:aiDetectParams', async (event, projectPath, routePath, method, filePath, apiKey) => {
    return await aiDetectParams(projectPath, routePath, method, filePath, apiKey);
  });

  ipcMain.handle('api:sendRequest', async (event, requestData) => {
    return await sendRequest(requestData);
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
