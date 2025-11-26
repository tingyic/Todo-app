import { useEffect, useRef, useState, useCallback } from "react";
import type { Todo } from "../types";
import { parseLocalDateTime } from "../utils/dates";

type NotifOpts = NotificationOptions & { renotify?: boolean};
type Props = { todos: Todo[]; enabled?: boolean };

type FiredReminder = {
  key: string;
  todo: Todo;
  label: string;
  fireTime: number;
};

const DB_NAME = "todo-snoozes-v1";
const DB_STORE = "snoozes";

type SnoozeRecord = {
  key: string;
  todoId: string;
  action?: string;
  at: number;
  createdAt: number;
};

function idbOpen(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE, { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbPut(item: SnoozeRecord) {
  const db = await idbOpen();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).put(item);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbDelete(key: string) {
  const db = await idbOpen();
  return new Promise<void>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readwrite");
    tx.objectStore(DB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbGetAll() {
  const db = await idbOpen();
  return new Promise<SnoozeRecord[]>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

export default function ReminderManager({ todos, enabled = true }: Props) {
  const timers = useRef<Map<string, number>>(new Map()); // key => timerId
  const [toasts, setToasts] = useState<Array<{ id: string; title: string; when: string }>>([]);

  // fired/triggered reminders that can be snoozed/dismissed
  const [activeReminders, setActiveReminders] = useState<FiredReminder[]>([]);
  
  const permissionRef = useRef<NotificationPermission | null>(null);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);

  useEffect(() => {
    permissionRef.current = typeof Notification !== "undefined" ? Notification.permission : null;
  }, []);

  useEffect(() => {
    if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
      navigator.serviceWorker.register("/service-worker.js")
      .then(reg => {
        swRegRef.current = reg;
      })
      .catch(e => {
        console.debug("SW register failed:", e);
        swRegRef.current = null;
      });
    }
  }, []);

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    try {
      permissionRef.current = await Notification.requestPermission();
    } catch {
      permissionRef.current = "denied";
    }
  }

  const pushToast = useCallback((id: string, title: string, when: string) => {
    setToasts(t => [{ id, title, when }, ...t].slice(0, 5));
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 10_000);
  }, []);

  // doNotify wrapped in useCallback so effect deps are stable
  const doNotify = useCallback(async (todo: Todo, label: string, key: string, fireTime: number) => {
    setActiveReminders(r => {
      if (r.some(x => x.key === key)) return r;
      return [...r, { key, todo, label, fireTime }];
    });
    const title = `Reminder: ${todo.text}`;
    const bodyParts: string[] = [];
    if (todo.due) bodyParts.push(`Due: ${formatLocal(todo.due)}`);
    if (todo.tags?.length) bodyParts.push(`Tags: ${todo.tags.join(", ")}`);
    const body = [label, ...bodyParts].join(" • ");

    const actions = [
      { action: "snooze-5", title: "Snooze 5m" },
      { action: "snooze-15", title: "Snooze 15m" },
      { action: "snooze-60", title: "Snooze 1h" },
      { action: "dismiss", title: "Dismiss" },
    ];

    try {
      if (swRegRef.current && Notification.permission === "granted" && typeof swRegRef.current.showNotification === "function") {
        await swRegRef.current.showNotification(title, {
          body,
          tag: `todo-reminder-${todo.id}`,
          renotify: true,
          data: { todoId: todo.id },
          actions,
        } as NotificationOptions);
        return;
      }
    } catch (e) {
      console.debug("sw showNotification failed:", e); 
    }

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        const opts: NotifOpts = { body, tag: `todo-reminder-${todo.id}`, renotify: true};
        const n = new Notification(title, opts);
        n.onclick = () => (window.focus(), n.close());
        return;
      } catch (e) {
        console.debug("page Notification failed:", e);
      }
    }

    pushToast(todo.id, title, body);
    if (permissionRef.current === "default") setTimeout(() => void requestPermission(), 1000);
  }, [pushToast]);

  // schedule helper: schedules a JS timer and stores id in timers map
  const scheduleNotify = useCallback((key: string, todoId: string, whenMs: number, label = "Reminder") => {
    // clear existing for same key
    if (timers.current.has(key)) {
      clearTimeout(timers.current.get(key)!);
      timers.current.delete(key);
    }
    const delay = Math.max(0, whenMs - Date.now());
    const timeoutId = window.setTimeout(() => {
      const todo = todos.find(t => t.id === todoId);
      if (todo) doNotify(todo, label, key, whenMs);
      timers.current.delete(key);
      if (key.startsWith("snooze::")) {
        void idbDelete(key).catch(() => {});
      }
    }, delay);
    timers.current.set(key, timeoutId);
  }, [doNotify, todos]);

  const processAction = useCallback(async (action: string, todoId?: string) => {
    if (!todoId) return;
    if (action.startsWith("snooze-")) {
      const minutes = Number(action.split("-")[1]) || 5;
      const snoozeAt = Date.now() + minutes * 60_000;
      const key = `snooze::${todoId}::${snoozeAt}`;
      try {
        await idbPut({ key, todoId, action, at: snoozeAt, createdAt: Date.now() });
      } catch (e) {
        console.debug("idbPut failed:", e);
      }
      scheduleNotify(key, todoId, snoozeAt, `Snoozed ${minutes} min`);
      pushToast(todoId, `Snoozed ${minutes} min`, `Will remind in ${minutes} min`);
      return;
    }
    if (action === "dismiss") {
      // remove any active reminders in UI for that todo
      setActiveReminders(a => a.filter(x => x.todo.id !== todoId));
      pushToast(todoId, "Reminder dismissed", "");
      return;
    }
  }, [scheduleNotify, pushToast]);

  // Listen to messages from service worker (e.g. notification actions)
  useEffect(() => {
    function onSWMessage(ev: MessageEvent) {
      const msg = ev.data;
      if (!msg) return;
      if (msg.type === "notification-action") {
        // msg.action e.g. snooze-5, msg.todoId
        void processAction(msg.action, msg.todoId);
      } else if (msg.type === "notification-click") {
        // user clicked the notification body
        if (msg.todoId) pushToast(msg.todoId, "Notification clicked", "");
      }
    }

    navigator.serviceWorker?.addEventListener("message", onSWMessage);
    return () => {
      navigator.serviceWorker?.removeEventListener("message", onSWMessage);
    };
  }, [processAction, pushToast]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const rows = await idbGetAll();
        if (!mounted) return;
        for (const r of rows) {
          if (!r || !r.key || !r.todoId || !r.at) continue;
          const when = Number(r.at);
          // if snooze time is in the past but within a small grace window (e.g. < 1m), fire immediate
          if (when <= Date.now() + 60_000) {
            const todo = todos.find(t => t.id === r.todoId);
            if (todo) void doNotify(todo, `Snoozed reminder`, r.key, when);
            await idbDelete(r.key).catch(() => {});
            continue;
          }
          scheduleNotify(r.key, r.todoId, when, "Snoozed reminder");
        }
      } catch {
        console.debug("idbGetAll failed or no indexedDB available");
      }
    })();
    return () => { mounted = false; };
  }, [doNotify, scheduleNotify, todos]);  

  // Snooze handler
  function snooze(rem: FiredReminder, minutes: number) {
    const todo = rem.todo;
    if (!todo) {
      setActiveReminders(a => a.filter(x => x.key !== rem.key));
      return;
    }

    const newFire = Date.now() + minutes * 60_000;
    const newKey = `${todo.id}::snooze${minutes}::${newFire}`;

    void idbPut({ key: newKey, todoId: todo.id, action: `snooze-${minutes}`, at: newFire, createdAt: Date.now() })
      .catch(e => console.debug("idbPut failed:", e));

    scheduleNotify(newKey, todo.id, newFire, `Snoozed ${minutes} min`);
    setActiveReminders(a => a.filter(x => x.key !== rem.key));
    pushToast(todo.id, `Snoozed ${minutes}m`, `We'll remind you in ${minutes} minutes`);
  }

  function dismiss(rem: FiredReminder) {
    setActiveReminders(a => a.filter(x => x.key !== rem.key));
    void idbDelete(rem.key).catch(() => {});
  }

  useEffect(() => {
    if (!enabled) {
      timers.current.forEach(id => clearTimeout(id));
      timers.current.clear();
      return;
    }

    // helper to make key for a specific reminder minutes value
    const makeKey = (todoId: string, minutes: number, fireAt: number) => `${todoId}::${minutes}::${fireAt}`;

    function scheduleFor(todo: Todo) {
      if (!todo.due || todo.done) return;
      const dueDate = parseLocalDateTime(todo.due);
      if (!dueDate) return;

      const reminders = Array.isArray(todo.reminders) ? todo.reminders : [];
      for (const m of reminders) {
        const fireAt = dueDate.getTime() - Math.max(0, Math.floor(Number(m) || 0)) * 60_000;
        // skip reminders whose remindAt is past (we don't want to remind for expired deadlines)
        if (fireAt <= Date.now()) continue;

        const key = makeKey(todo.id, m, fireAt);
        if (timers.current.has(key)) continue; // already scheduled

        const delay = Math.max(0, fireAt - Date.now());
        const timerId = window.setTimeout(() => {
          void doNotify(todo, m === 0 ? "Due now" : `Remind ${m} min before`, key, fireAt);
          timers.current.delete(key);
        }, delay);
        timers.current.set(key, timerId);
      }
    }

    function cancelAllFor(todoId: string) {
      for (const key of Array.from(timers.current.keys())) {
        if (key.includes(`::${todoId}::`) || key.startsWith(`snooze::${todoId}::`)) {
          const id = timers.current.get(key)!;
          clearTimeout(id);
          timers.current.delete(key);
        }
      }
    }

    // schedule for current todos
    const currentIds = new Set<string>();
    for (const t of todos) {
      currentIds.add(t.id);
      // remove old timers if todo marked done or removed or reminders changed
      cancelAllFor(t.id);
      scheduleFor(t);
    }

    // clear timers for deleted todos
    for (const key of Array.from(timers.current.keys())) {
      const parts = key.split("::");
      const maybeId = parts[1] ?? parts[0];
      if (maybeId && !currentIds.has(maybeId)) {
        clearTimeout(timers.current.get(key)!);
        timers.current.delete(key);
      }
    }

    // reconcile every minute in case of clock changes / new todos added by other tabs
    const reconciler = window.setInterval(() => {
      for (const t of todos) {
        if (t.due && !t.done) scheduleFor(t);
      }
    }, 60_000);

    return () => clearInterval(reconciler);
  }, [todos, enabled, doNotify]); // include doNotify to satisfy lint

  return (
    <>
      {/* Snooze popup cards */}
      <div className="snooze-stack">
        {activeReminders.map(rem => (
          <div key={rem.key} className="snooze-card" role="dialog" aria-live="polite">
            <div className="snooze-title">{rem.todo.text}</div>
            <div className="snooze-sub">{rem.label}</div>

            <div className="snooze-actions">
              <button className="snooze-btn" onClick={() => snooze(rem, 5)} aria-label="Snooze 5 minutes">Snooze 5m</button>
              <button className="snooze-btn" onClick={() => snooze(rem, 15)} aria-label="Snooze 15 minutes">15m</button>
              <button className="snooze-btn" onClick={() => snooze(rem, 60)} aria-label="Snooze 1 hour">1h</button>

              <button
                className="snooze-btn snooze-dismiss"
                onClick={() => dismiss(rem)}
                aria-label="Dismiss reminder"
                title="Dismiss"
              >
                Dismiss
              </button>
            </div>
          </div>
        ))}
      </div>
      <div style={{
        position: "fixed", right: 12, bottom: 12,
        display: "flex", flexDirection: "column", gap: 8, zIndex: 9999, maxWidth: 320,
      }}>
        {toasts.map(t => (
          <div key={t.id + t.when} className="toast" style={{
            background: "var(--app-card)", color: "var(--app-text)", padding: "10px 12px",
            borderRadius: 8, boxShadow: "0 6px 20px rgba(2, 6, 23, 0.6)"
          }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>{t.when}</div>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setToasts(s => s.filter(x => x.id !== t.id))} className="btn-plain">Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function formatLocal(isoLocal: string) {
  try {
    const d = parseLocalDateTime(isoLocal);
    if (!d) return isoLocal;
    return d.toLocaleString();
  } catch {
    return isoLocal;
  }
}
