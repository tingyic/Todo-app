const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveData: (name, json) => ipcRenderer.invoke('save-data', name, json),
  readData: (name) => ipcRenderer.invoke('read-data', name),
  getUserDataPath: () => ipcRenderer.invoke('get-user-data-path'),
});