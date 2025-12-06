import { app, BrowserWindow, ipcMain, Notification, Tray, nativeImage } from "electron";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = !app.isPackaged;

let mainWindow = null;
let tray = null;
let isQuiting = false;
const fsPromises = fs.promises;
const timers = new Map(); // key -> NodeJS.Timeout

function createWindow() {
  const win = new BrowserWindow({
    width: 1000,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, "dist", "index.html"));
  }

  win.on("close", (e) => {
    if (!isQuiting) {
      e.preventDefault();
      win.hide();
    }
  });

  mainWindow = win;
  return win;
}

function findTrayIconPaths() {
  // order: project root (dev), dist root, packaged resources (app.getAppPath())
  return [
    path.join(__dirname, "tray-icon.png"),
    path.join(process.cwd(), "tray-icon.png"),
    path.join(__dirname, "assets", "tray-icon.png"),
    path.join(app.getAppPath ? app.getAppPath() : __dirname, "tray-icon.png"),
    path.join(app.getAppPath ? app.getAppPath() : __dirname, "assets", "tray-icon.png"),
  ];
}

function schedulesFilePath() {
  try {
    return path.join(app.getPath("userData"), "schedules.json");
  } catch {
    // fallback to __dirname if app.getPath isn't available
    return path.join(__dirname, "schedules.json");
  }
}

async function loadPersistedSchedules() {
  try {
    const file = schedulesFilePath();
    const raw = await fsPromises.readFile(file, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
async function savePersistedSchedules(schedules) {
  try {
    const file = schedulesFilePath();
    await fsPromises.mkdir(path.dirname(file), { recursive: true });
    await fsPromises.writeFile(file, JSON.stringify(schedules, null, 2), "utf8");
  } catch (err) {
    console.error("savePersistedSchedules failed:", err);
  }
}
async function removePersistedSchedule(key) {
  const all = await loadPersistedSchedules();
  const remaining = all.filter((s) => s.key !== key);
  await savePersistedSchedules(remaining);
}

function scheduleNotification(schedule) {
  const { key, whenMs, payload } = schedule;
  // clear any existing
  if (timers.has(key)) {
    clearTimeout(timers.get(key));
    timers.delete(key);
  }
  const delay = Math.max(0, whenMs - Date.now());
  const id = setTimeout(async () => {
    try {
      // show native notification
      const n = new Notification({ title: payload.title ?? "Todo", body: payload.body ?? "" });
      n.show();
    } catch (e) {
      console.error("show notification failed", e);
    } finally {
      timers.delete(key);
      // remove one-shot schedule from persisted store
      try { await removePersistedSchedule(key); } catch {}
    }
  }, delay);
  timers.set(key, id);
}

async function rescheduleAll() {
  try {
    const all = await loadPersistedSchedules();
    for (const s of all) {
      if (!s || !s.key || !s.whenMs) continue;
      // if it's in the future, schedule it; otherwise remove it
      if (Number(s.whenMs) > Date.now()) {
        scheduleNotification(s);
      } else {
        await removePersistedSchedule(s.key).catch(() => {});
      }
    }
    return all;
  } catch (err) {
    console.error("rescheduleAll failed", err);
    return [];
  }
}

function createTray() {
  try {
    const candidates = findTrayIconPaths();
    let iconPath = null;
    for (const p of candidates) {
      try {
        if (p && fs.existsSync(p)) {
          iconPath = p;
          break;
        }
      } catch {
        // ignore
      }
    }

    if (!iconPath) {
      console.info("createTray skipped: icon file not found in any candidate path", candidates);
      return null;
    }

    const img = nativeImage.createFromPath(iconPath);
    if (!img || img.isEmpty()) {
      console.info("createTray skipped: nativeImage empty for", iconPath);
      return null;
    }

    tray = new Tray(img);
    tray.setToolTip("Todo App");
    tray.on("click", () => {
      const wins = BrowserWindow.getAllWindows();
      if (wins.length > 0) {
        wins[0].show();
        wins[0].focus();
      }
    });

    console.info("createTray: created tray with icon", iconPath);
    return tray;
  } catch (err) {
    console.warn("createTray failed (platform / nativeImage issue):", err);
    return null;
  }
}

app.commandLine.appendSwitch("disable-features", "AutofillServerCommunication");

app.whenReady().then(async () => {
  try {
    createWindow();
  } catch (err) {
    console.error("createWindow failed", err);
  }

  // create tray but do not allow it to throw
  try {
    createTray();
  } catch (err) {
    console.warn("Tray creation error (caught):", err);
  }

  // call rescheduleAll safely
  try {
    await rescheduleAll();
    console.info("rescheduleAll completed.");
  } catch (err) {
    console.warn("rescheduleAll threw:", err);
  }
});

app.on("before-quit", () => {
  isQuiting = true;
});
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

ipcMain.handle("get-user-data-path", async () => {
  return app.getPath("userData");
});

ipcMain.handle("save-data", async (ev, name, json) => {
  try {
    const filePath = path.join(app.getPath("userData"), name);
    await fsPromises.mkdir(path.dirname(filePath), { recursive: true });
    await fsPromises.writeFile(filePath, JSON.stringify(json, null, 2), "utf8");
    return { ok: true, path: filePath };
  } catch (err) {
    console.error("save-data failed", err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("read-data", async (ev, name) => {
  try {
    const filePath = path.join(app.getPath("userData"), name);
    const data = await fsPromises.readFile(filePath, "utf8");
    return { ok: true, data: JSON.parse(data), path: filePath };
  } catch (err) {
    // not found or parse error
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("fetch-push-public-key", async () => {
  try {
    const url = "https://todo-app-wxtc.onrender.com/config/push-public-key";
    const res = await fetch(url, { method: "GET" });
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const json = await res.json();
    return { ok: true, publicKey: json.publicKey ?? null };
  } catch (err) {
    console.error("fetch-push-public-key failed", err);
    return { ok: false, error: String(err) };
  }
});

/* Schedules IPC: add / remove / list */
ipcMain.handle("schedules-add", async (ev, schedule) => {
  try {
    const all = await loadPersistedSchedules();
    // avoid duplicates: remove same key if exists
    const filtered = all.filter((s) => s.key !== schedule.key);
    filtered.push(schedule);
    await savePersistedSchedules(filtered);
    scheduleNotification(schedule);
    return { ok: true };
  } catch (err) {
    console.error("schedules-add failed", err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("schedules-remove", async (ev, key) => {
  try {
    const all = await loadPersistedSchedules();
    const remaining = all.filter((s) => s.key !== key);
    await savePersistedSchedules(remaining);
    if (timers.has(key)) {
      clearTimeout(timers.get(key));
      timers.delete(key);
    }
    return { ok: true };
  } catch (err) {
    console.error("schedules-remove failed", err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("schedules-list", async () => {
  try {
    const schedules = await loadPersistedSchedules();
    return { ok: true, schedules };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
});

/* show-notification: immediate native notification */
ipcMain.handle("show-notification", async (ev, payload) => {
  try {
    const n = new Notification({ title: payload.title ?? "Notification", body: payload.body ?? "" });
    n.show();
    return { ok: true };
  } catch (err) {
    console.error("show-notification failed", err);
    return { ok: false, error: String(err) };
  }
});
