// The only thing the renderer is given, and only the error page uses it: try
// starting again, or open the log for whoever gets called for help.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('startup', {
  retry: () => ipcRenderer.invoke('startup:retry'),
  openLog: () => ipcRenderer.invoke('startup:open-log'),
});
