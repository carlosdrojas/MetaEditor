const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  selectDirectory: () => ipcRenderer.invoke("dialog:openDirectory"),

  selectFile: (filters) => ipcRenderer.invoke("dialog:openFile", filters),

  runProcess: (args) => ipcRenderer.invoke("run:process", args),

  onProcessOutput: (callback) => {
    ipcRenderer.removeAllListeners("process:output");
    ipcRenderer.on("process:output", (_event, line) => callback(line));
  },

  onProcessDone: (callback) => {
    ipcRenderer.removeAllListeners("process:done");
    ipcRenderer.on("process:done", (_event, code) => callback(code));
  },
});
