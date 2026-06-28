// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('dialog:openDirectory'),
  detectProject: (projectPath) => ipcRenderer.invoke('api:detectProject', projectPath),
  scanRoutes: (projectPath, type) => ipcRenderer.invoke('api:scanRoutes', projectPath, type),
  detectParams: (filePath, method, type) => ipcRenderer.invoke('api:detectParams', filePath, method, type),
  sendRequest: (requestData) => ipcRenderer.invoke('api:sendRequest', requestData),
  aiScanStructure: (projectPath, apiKey) => ipcRenderer.invoke('api:aiScanStructure', projectPath, apiKey),
  scanSpecificFiles: (projectPath, files, type) => ipcRenderer.invoke('api:scanSpecificFiles', projectPath, files, type),
  aiDetectParams: (projectPath, routePath, method, filePath, apiKey) => ipcRenderer.invoke('api:aiDetectParams', projectPath, routePath, method, filePath, apiKey)
});
