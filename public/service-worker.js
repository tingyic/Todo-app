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

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    // event.data might be a non-JSON string (text), fall back gracefully
    payload = { title: "Reminder", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Reminder";
  const body = payload.body || "";
  const tag = payload.tag || `todo-reminder-${payload.todoId || "unknown"}`;

  const actions = [
    { action: "snooze-5", title: "Snooze 5m" },
    { action: "snooze-15", title: "Snooze 15m" },
    { action: "snooze-60", title: "Snooze 1h" },
    { action: "dismiss", title: "Dismiss" },
  ];

  const options = {
    body,
    tag,
    renotify: true,
    data: { todoId: payload.todoId, sentAt: Date.now() },
    actions,
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  const notification = event.notification;
  const action = event.action; // "snooze-5", "snooze-15", "snooze-60", "dismiss"
  const data = notification.data || {};
  const todoId = data.todoId || null;

  // Always close
  notification.close();

  // If user clicked the body (no action), just focus/open the app
  if (!action) {
    event.waitUntil((async () => {
      try {
        const windowClients = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        if (windowClients && windowClients.length) {
          // prefer focusing an already-open client and post a message
          const client = windowClients[0];
          try {
            client.postMessage({ type: "notification-click", todoId });
            return client.focus();
          } catch (e) {
            return client.focus();
          }
        }
        // fallback: open the app root
        if (self.clients.openWindow) {
          const url = "/?notifOpen=1" + (todoId ? "&todo=" + encodeURIComponent(todoId) : "");
          return self.clients.openWindow(url);
        }
      } catch (e) {
        // ignore
      }
    })());
    return;
  }

  // action handlers
  event.waitUntil((async () => {
    // persist the action in idb so clients can pick up even after reload
    const timestamp = Date.now();

    // If it's a snooze action like "snooze-5"
    if (typeof action === "string" && action.startsWith("snooze-")) {
      const minutes = Number(action.split("-")[1]) || 5;
      // schedule target time (ms)
      const at = Date.now() + minutes * 60_000;
      const key = `snooze::${todoId || "unknown"}::${at}`;

      await idbPut({
        key,
        todoId,
        action,
        at,
        createdAt: timestamp,
      }).catch(() => { /* best-effort */ });

      // notify open clients immediately so UI updates if they are open
      await postToClients({ type: "notification-action", action, todoId, ts: timestamp, at });

      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (!windows || windows.length === 0) {
        if (self.clients.openWindow) {
          const url = "/?notifAction=" + encodeURIComponent(action) + (todoId ? "&todo=" + encodeURIComponent(todoId) : "");
          try { await self.clients.openWindow(url); } catch (e) { /* empty */ }
        }
      }

      return;
    }

    // If it's a dismiss action
    if (action === "dismiss") {
      const key = `dismiss::${todoId || "unknown"}::${timestamp}`;
      await idbPut({ key, todoId, action: "dismiss", at: timestamp, createdAt: timestamp }).catch(() => {});
      await postToClients({ type: "notification-action", action: "dismiss", todoId, ts: timestamp });

      // try opening a client so user sees app if none open
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      if (!windows || windows.length === 0) {
        if (self.clients.openWindow) {
          try { await self.clients.openWindow("/"); } catch (e) { /* ignore */ }
        }
      }
      return;
    }

    await postToClients({ type: "notification-action", action, todoId, ts: timestamp });
  })());
});

self.addEventListener("pushsubscriptionchange", (event) => {
  event.waitUntil(
    (async () => {
      try {
        await postToClients({ type: "push-subscription-changed", reason: "subscriptionchange" });
      } catch (e) {
        // ignore
      }
    })()
  );
});
