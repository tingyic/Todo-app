const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  saveData: (name, json) => ipcRenderer.invoke("save-data", name, json),
  readData: (name) => ipcRenderer.invoke("read-data", name),
  getUserDataPath: () => ipcRenderer.invoke("get-user-data-path"),
  fetchPushPublicKey: () => ipcRenderer.invoke("fetch-push-public-key"),
  schedulesAdd: (schedule) => ipcRenderer.invoke("schedules-add", schedule),
  schedulesRemove: (key) => ipcRenderer.invoke("schedules-remove", key),
  schedulesList: () => ipcRenderer.invoke("schedules-list"),
  showNotification: (payload) => ipcRenderer.invoke("show-notification", payload),
  saveDataSync: (name, json) => ipcRenderer.sendSync("save-data-sync", name, json),
  sendSync: (channel, ...args) => ipcRenderer.sendSync(channel, ...args)
});
