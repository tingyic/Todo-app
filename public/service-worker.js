const DB_NAME = "todo-snoozes-v1";
const DB_STORE = "snoozes";

function idbOpen() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = (e) => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(item) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(item);
    tx.oncomplete = () => resolve(item);
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key) {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll() {
  const db = await idbOpen();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

// Helper to post message to all client windows
async function postToClients(msg) {
  const clientsList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of clientsList) {
    try {
      c.postMessage(msg);
    } catch (e) { /* ignore */ }
  }
}

self.addEventListener("install", (ev) => {
  ev.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", (ev) => {
  ev.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = event.action; // "snooze-5", "snooze-15", "snooze-60", "dismiss"
  const data = notification.data || {};
  const todoId = data.todoId;

  // Always close
  notification.close();

  // If user clicked the body (no action), just focus/open the app
  if (!action) {
    event.waitUntil((async () => {
      const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (all.length > 0) {
        all[0].focus();
        all[0].postMessage({ type: "notification-click", todoId });
      } else {
        // open app, include query so client knows to handle if needed
        await self.clients.openWindow("/?notifOpen=1&todo=" + encodeURIComponent(todoId || ""));
      }
    })());
    return;
  }

  // action handlers
  event.waitUntil((async () => {
    // persist the action in idb so clients can pick up even after reload
    const timestamp = Date.now();
    const key = `action::${todoId || "unknown"}::${timestamp}`;
    const record = {
      key,
      todoId,
      action,
      ts: timestamp,
    };
    try {
      await idbPut(record);
    } catch (err) {
      // ignore storage failure
    }

    // notify any open clients to schedule in-memory timers and confirm
    await postToClients({ type: "notification-action", action, todoId, ts: timestamp });

    // If no client window open, open one so user sees the app
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    if (!windows.length) {
      await self.clients.openWindow("/?notifAction=" + encodeURIComponent(action) + "&todo=" + encodeURIComponent(todoId || ""));
    }
  })());
});