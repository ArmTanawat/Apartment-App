// What the renderer is given, and nothing more.
//
// startup: only the error page uses it — try starting again, or open the log
// for whoever gets called for help.
//
// exporter: Export เป็นรูปภาพ on บิล. A page cannot pick a folder or write files,
// so it asks; electron/export.js does the work. Its absence is how the page
// knows it is in a browser rather than the desktop program.
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('startup', {
  retry: () => ipcRenderer.invoke('startup:retry'),
  openLog: () => ipcRenderer.invoke('startup:open-log'),
});

contextBridge.exposeInMainWorld('exporter', {
  pickFolder: start => ipcRenderer.invoke('export:pick-folder', start),
  run: opts => ipcRenderer.invoke('export:run', opts),
  names: period => ipcRenderer.invoke('export:names', period),
  openFolder: dir => ipcRenderer.invoke('export:open-folder', dir),
  // Returns the way to stop listening, for the dialog to call when it closes.
  onProgress: fn => {
    const handler = (_, p) => fn(p);
    ipcRenderer.on('export:progress', handler);
    return () => ipcRenderer.removeListener('export:progress', handler);
  },
});
