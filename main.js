import { app, BrowserWindow, ipcMain } from 'electron';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (isDev) {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// Persistence example:
const fsPromises = fs.promises;

ipcMain.handle('get-user-data-path', async () => {
  return app.getPath('userData');
});

ipcMain.handle('save-data', async (ev, name, json) => {
  try {
    const filePath = path.join(app.getPath('userData'), name);
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(json, null, 2), 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    console.error('save-data failed', err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle('read-data', async (ev, name) => {
  try {
    const filePath = path.join(app.getPath('userData'), name);
    const data = await fsPromises.readFile(filePath, 'utf8');
    return { ok: true, data: JSON.parse(data), path: filePath };
  } catch (err) {
    // not found or parse error
    return { ok: false, error: String(err) };
  }
});
