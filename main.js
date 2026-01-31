const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { runProcessing } = require("./src/processing");

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 720,
    height: 820,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, "renderer", "index.html"));
}

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// --- IPC Handlers ---

ipcMain.handle("dialog:openDirectory", async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openDirectory"],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("dialog:openFile", async (_event, filters) => {
  const result = await dialog.showOpenDialog(mainWindow, {
    properties: ["openFile"],
    filters: filters || [],
  });
  if (result.canceled) return null;
  return result.filePaths[0];
});

ipcMain.handle("run:process", async (event, args) => {
  const onLog = (line) => {
    mainWindow.webContents.send("process:output", line);
  };

  let code;
  try {
    code = await runProcessing(args, onLog);
  } catch (err) {
    onLog(`[error] ${err.message}`);
    code = 1;
  }

  mainWindow.webContents.send("process:done", code);
  return code;
});
