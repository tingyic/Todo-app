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
const DATA_SCHEDULES = path.join(app.getPath("userData"), "schedules.json");
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
}

async function loadPersistedSchedules() {
  try {
    const raw = await fs.readFile(DATA_SCHEDULES, "utf8");
    return JSON.parse(raw);
  } catch {
    return [];
  }
}
async function savePersistedSchedules(schedules) {
  try {
    await fs.mkdir(path.dirname(DATA_SCHEDULES), { recursive: true });
    await fs.writeFile(DATA_SCHEDULES, JSON.stringify(schedules, null, 2), "utf8");
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
      const n = new Notification({ title: payload.title, body: payload.body });
      n.show();
    } catch (e) {
      console.error("show notification failed", e);
    } finally {
      timers.delete(key);
      // remove one-shot schedule from persisted store
      await removePersistedSchedule(key).catch(() => {});
    }
  }, delay);
  timers.set(key, id);
}

async function rescheduleAll() {
  const all = await loadPersistedSchedules();
  for (const s of all) {
    // if it's in the past, skip (or optionally trigger)
    if (Number(s.whenMs) > Date.now()) scheduleNotification(s);
    else await removePersistedSchedule(s.key).catch(() => {});
  }
}

function createTray() {
  try {
    const iconPath = path.join(__dirname, "tray-icon.png");
    const icon = nativeImage.createFromPath(iconPath);
    tray = new Tray(icon.isEmpty() ? undefined : icon);
    tray.setToolTip("todo-app");
    tray.on("click", () => {
      if (!mainWindow) return;
      if (mainWindow.isVisible()) mainWindow.hide();
      else mainWindow.show();
    });
  } catch (e) {
    console.debug("createTray failed (no tray icon or platform issue):", e);
  }
}

app.whenReady().then(async () => {
  createWindow();
  createTray();
  await rescheduleAll();
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
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(json, null, 2), "utf8");
    return { ok: true, path: filePath };
  } catch (err) {
    console.error("save-data failed", err);
    return { ok: false, error: String(err) };
  }
});

ipcMain.handle("read-data", async (ev, name) => {
  try {
    const filePath = path.join(app.getPath("userData"), name);
    const data = await fs.readFile(filePath, "utf8");
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
