import { useEffect, useRef, useState, useCallback } from "react";
import type { Todo } from "../types";
import { parseLocalDateTime } from "../utils/dates";
import { getPushPublicKey, subscribeForPush } from "../utils/push";

const SERVER_ORIGIN = import.meta.env.VITE_PUSH_SERVER_ORIGIN || "";
function serverUrl(path: string) {
  return SERVER_ORIGIN ? `${SERVER_ORIGIN}${path}` : path;
}

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

type SchedulePayload = {
  title: string;
  body: string;
  todoId?: string;
  tag?: string;
};

type ScheduleItem = {
  key: string;
  whenMs: number;
  payload: SchedulePayload;
};

type Toast = {
  id: string;
  uid: string;
  title: string;
  when: string;
}

type ElectronSchedulesListResult = { ok: true; schedules: { key: string; whenMs: number; payload: unknown }[] } | { ok: false; error?: string };

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

async function idbGetAll(): Promise<SnoozeRecord[]> {
  const db = await idbOpen();
  return new Promise<SnoozeRecord[]>((resolve, reject) => {
    const tx = db.transaction(DB_STORE, "readonly");
    const req = tx.objectStore(DB_STORE).getAll();
    req.onsuccess = () => resolve(req.result || []);
    req.onerror = () => reject(req.error);
  });
}

function getSubscriptionEndpoint(sub: PushSubscription | null): string | null {
  if (!sub) return null;
  try {
    if (typeof sub.endpoint === "string" && sub.endpoint.length > 0) return sub.endpoint;
  } catch {
    // empty
  }
  return null;
}

type ElectronAPI = {
  fetchPushPublicKey?: () => Promise<{ ok: boolean; publicKey?: string | null; error?: string }>;
  showNotification?: (payload: { title?: string; body?: string }) => Promise<{ ok?: boolean }>;
  schedulesAdd?: (schedule: ScheduleItem) => Promise<{ ok?: boolean }>;
  schedulesRemove?: (key: string) => Promise<{ ok?: boolean }>;
  schedulesList?: () => Promise<{ ok?: boolean; schedules?: ScheduleItem[] }>;
};

export default function ReminderManager({ todos, enabled = true }: Props) {
  const timers = useRef<Map<string, number>>(new Map()); // key => timerId
  const [toasts, setToasts] = useState<Toast[]>([]);

  // fired/triggered reminders that can be snoozed/dismissed
  const [activeReminders, setActiveReminders] = useState<FiredReminder[]>([]);
  
  const permissionRef = useRef<NotificationPermission | null>(null);
  const swRegRef = useRef<ServiceWorkerRegistration | null>(null);

  const [pushEnabled, setPushEnabled] = useState<boolean>(false);
  const [pushBusy, setPushBusy] = useState<boolean>(false);
  const subEndpointRef = useRef<string | null>(null);

  async function sendSchedulesToServer(endpoint: string, schedules: ScheduleItem[]) {
    try {
      await fetch(serverUrl("/api/schedule"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, schedules }),
      });
    } catch (err) {
      console.debug("sendSchedulesToServer failed", err);
    }
  }

  async function sendCancelToServer(endpoint: string, key: string) {
    try {
      await fetch(serverUrl("/api/schedule/cancel"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint, key }),
      });
    } catch (err) {
      console.debug("sendCancelToServer failed", err);
    }
  }

  function buildSchedulesFromTodos(todosList: Todo[]): ScheduleItem[] {
    const out: ScheduleItem[] = [];
    for (const todo of todosList) {
      if (!todo.due || todo.done) continue;
      const dueDate = parseLocalDateTime(todo.due);
      if (!dueDate) continue;
      const reminders = Array.isArray(todo.reminders) ? todo.reminders : [];
      for (const m of reminders) {
        const whenMs = dueDate.getTime() - Math.max(0, Math.floor(Number(m) || 0)) * 60_000;
        if (whenMs <= Date.now()) continue;
        const key = `${todo.id}::${m}::${whenMs}`;
        const payload: SchedulePayload = {
          title: `Reminder: ${todo.text}`,
          body: (m === 0 ? "Due now" : `Remind ${m} min before`) + (todo.due ? ` • Due: ${formatLocal(todo.due)}` : ""),
          todoId: todo.id,
        };
        out.push({ key, whenMs, payload });
      }
    }
    return out;
  }

  useEffect(() => {
    permissionRef.current = typeof Notification !== "undefined" ? Notification.permission : null;
  }, []);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    if (!(location.protocol === "https:" || location.hostname === "localhost")) return;

    let mounted = true;
    (async () => {
      try {
        const reg = await navigator.serviceWorker.register("/service-worker.js");
        if (!mounted) return;
        swRegRef.current = reg;

        // Wait for ready then check existing subscription
        const ready = await navigator.serviceWorker.ready;
        if (!mounted) return;
        const sub = await ready.pushManager.getSubscription();
        const endpoint = getSubscriptionEndpoint(sub);
        subEndpointRef.current = endpoint;
        setPushEnabled(Boolean(endpoint));
      } catch (err) {
        console.debug("SW register / subscription check failed", err);
        swRegRef.current = null;
        subEndpointRef.current = null;
        setPushEnabled(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  async function notifyServerUnsubscribe(endpoint: string | null) {
    if (!endpoint) return;
    try {
      await fetch(serverUrl("/api/unsubscribe"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint }),
      });
    } catch (err) {
      console.debug("notifyServerUnsubscribe failed", err);
    }
  }

  const pushToast = useCallback((id: string, title: string, when: string) => {
    const uid = `${id}:${Date.now()}:${Math.floor(Math.random() * 10_000)}`;
    console.debug("[pushToast] add", { id, uid, title, when });
    setToasts((prev) => [{ id, uid, title, when }, ...prev]);

    const t = setTimeout(() => {
      console.debug("[pushToast] auto-remove", uid);
      setToasts((prev) => prev.filter((x) => x.uid !== uid));
      window.clearTimeout(t);
    }, 10_000);

    return uid;
  }, []);

  async function enablePushNotifications() {
    setPushBusy(true);
    try {
      const win = window as unknown as { electronAPI?: ElectronAPI };
      const isElectron = typeof window !== "undefined" && !!win.electronAPI && typeof win.electronAPI.fetchPushPublicKey === "function";

      // If running in Electron, skip Web Push subscription
      if (isElectron) {
        pushToast("push-electron", "Push not available", "Web Push is not supported in the desktop app. Native notifications can be used instead.");
        if (win.electronAPI?.showNotification) {
          try {
            await win.electronAPI.showNotification({ title: "Reminders", body: "Native notifications are available in the desktop app." });
          } catch {
            // ignore
          }
        }
        setPushEnabled(true);
        return;
      }

      // === Browser (web) flow ===
      if (typeof navigator === "undefined" || typeof window === "undefined") {
        pushToast("push-unsupported", "Push not supported", "No navigator/window available.");
        return;
      }
      if (!("serviceWorker" in navigator) || typeof PushManager === "undefined") {
        pushToast("push-unsupported", "Push not supported", "Your browser doesn't support service workers or Push API.");
        return;
      }
      if (!(location.protocol === "https:" || location.hostname === "localhost")) {
        pushToast("push-insecure", "Push requires HTTPS", "Push only works on HTTPS or on localhost.");
        return;
      }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        pushToast("push-denied", "Notifications blocked", "Please enable notifications in your browser.");
        return;
      }

      const publicKey = await getPushPublicKey();
      if (!publicKey) {
        pushToast("push-error", "Failed to get public key", "Server unavailable or CORS blocked");
        return;
      }

      try {
        await navigator.serviceWorker.register("/service-worker.js");
      } catch (err) {
        console.error("service worker register failed", err);
        pushToast("push-error", "SW registration failed", String(err));
        return;
      }

      // create subscription
      let sub: PushSubscription;
      try {
        sub = await subscribeForPush(publicKey);
      } catch (err) {
        console.error("subscribeForPush failed", err);
        pushToast("push-error", "Subscription failed", String(err));
        return;
      }

      // send subscription to server
      try {
        const resp = await fetch(serverUrl("/api/subscribe"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: sub }),
        });
        if (!resp.ok) {
          pushToast("push-error", "Subscribe failed", `Server returned ${resp.status}`);
          return;
        }
      } catch (err) {
        console.error("send subscription failed", err);
        pushToast("push-error", "Subscribe failed", String(err));
        return;
      }

      const endpoint = getSubscriptionEndpoint(sub);
      subEndpointRef.current = endpoint;
      const schedules = buildSchedulesFromTodos(todos);
      if (endpoint && schedules.length) {
        void sendSchedulesToServer(endpoint, schedules);
      }

      setPushEnabled(true);
      pushToast("push-enabled", "Push enabled", "You'll receive reminders while the app is closed");
    } catch (err) {
      console.error("enablePushNotifications error", err);
      pushToast("push-error", "Push failed", String(err));
    } finally {
      setPushBusy(false);
    }
  }

  async function disablePushNotifications() {
    setPushBusy(true);
    try {
      const win = window as unknown as { electronAPI?: ElectronAPI };
      const isElectron = typeof window !== "undefined" && !!win.electronAPI;

      if (isElectron) {
        try {
          const res = await win.electronAPI?.schedulesList?.();
          if (res && res.ok && Array.isArray(res.schedules)) {
            for (const s of res.schedules) {
              await win.electronAPI?.schedulesRemove?.(s.key).catch(() => {});
            }
          }
        } catch (e) {
          console.debug("failed clearing schedules", e);
        }
        setPushEnabled(false);
        pushToast("push-disabled", "Push disabled", "Desktop native notifications disabled in UI.");
        setPushBusy(false);
        return;
      }

      const ready = await navigator.serviceWorker.ready;
      const sub = await ready.pushManager.getSubscription();
      const endpoint = getSubscriptionEndpoint(sub);
      if (sub) {
        try {
          await sub.unsubscribe();
        } catch (e) {
          console.debug("unsubscribe failed locally", e);
        }
      }
      await notifyServerUnsubscribe(endpoint);
      subEndpointRef.current = null;
      setPushEnabled(false);
      pushToast("push-disabled", "Push disabled", "You won't receive reminders while the app is closed");
    } catch (err) {
      console.error("disablePushNotifications error", err);
      pushToast("push-error", "Disable failed", String(err));
    } finally {
      setPushBusy(false);
    }
  }

  useEffect(() => {
    type ElectronAPI = {
      schedulesList?: () => Promise<ElectronSchedulesListResult>;
    };

    const win = window as unknown as { electronAPI?: ElectronAPI };
    const fn = win.electronAPI?.schedulesList;

    if (typeof fn !== "function") return;

    let mounted = true;
    (async () => {
      try {
        const res = await fn();
        if (!mounted) return;

        if (res && res.ok && Array.isArray(res.schedules) && res.schedules.length > 0) {
          setPushEnabled(true);
        } else {
          setPushEnabled(false);
        }
      } catch (err) {
        console.debug("schedulesList failed", err);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!enabled && pushEnabled) {
      let mounted = true;
      (async () => {
        setPushBusy(true);
        try {
          const ready = await navigator.serviceWorker.ready;
          const sub = await ready.pushManager.getSubscription();
          const endpoint = getSubscriptionEndpoint(sub);
          if (sub) {
            try {
              await sub.unsubscribe();
            } catch (e) {
              console.debug("unsubscribe failed locally", e);
            }
          }
          try {
            if (endpoint) {
              await fetch(serverUrl("/api/unsubscribe"), {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ endpoint }),
              });
            }
          } catch (e) {
            console.debug("notifyServerUnsubscribe failed", e);
          }
          if (!mounted) return;
          subEndpointRef.current = null;
          setPushEnabled(false);
          pushToast("push-disabled", "Push disabled", "You won't receive reminders while the app is closed");
        } catch (err) {
          console.error("auto-disable failed", err);
          pushToast("push-error", "Auto-disable failed", String(err));
        } finally {
          if (mounted) setPushBusy(false);
        }
      })();
      return () => { mounted = false; };
    }
  }, [enabled, pushEnabled, pushToast]);

  async function requestPermission() {
    if (typeof Notification === "undefined") return;
    try {
      permissionRef.current = await Notification.requestPermission();
    } catch {
      permissionRef.current = "denied";
    }
  }

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

    const win = window as unknown as { electronAPI?: ElectronAPI };
    if (win.electronAPI?.schedulesAdd) {
      const todo = todos.find(t => t.id === todoId);
      if (todo) {
        const payload: SchedulePayload = {
          title: `Reminder: ${todo.text}`,
          body: label + (todo.due ? ` • Due: ${formatLocal(todo.due)}` : ""),
          todoId,
        };
        const schedule: ScheduleItem = { key, whenMs, payload };
        void win.electronAPI.schedulesAdd(schedule).catch(e => console.debug("schedulesAdd failed", e));
      }
    } else {
      const endpoint = subEndpointRef.current;
      const todo = todos.find((t) => t.id === todoId);
      if (endpoint && todo) {
        const payload = {
          title: `Reminder: ${todo.text}`,
          body: label + (todo.due ? ` • Due: ${formatLocal(todo.due)}` : ""),
          todoId,
          tag: `todo-reminder-${todo.id}`,
        };
        const schedules: ScheduleItem[] = [{ key, whenMs, payload }];
        void sendSchedulesToServer(endpoint, schedules);
      }
    }
  }, [doNotify, todos]
);

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

      const endpoint = subEndpointRef.current;
      if (endpoint) {
        const payload = {
          title: `Reminder (snoozed)`,
          body: `Snoozed ${minutes} min`,
          todoId,
          tag: `todo-reminder-${todoId}`,
        };
        const schedules: ScheduleItem[] = [{ key, whenMs: snoozeAt, payload }];
        void sendSchedulesToServer(endpoint, schedules);
      }

      pushToast(todoId, `Snoozed ${minutes} min`, `Will remind in ${minutes} min`);
      return;
    }
    if (action === "dismiss") {
      // remove any active reminders in UI for that todo
      setActiveReminders(a => a.filter(x => x.todo.id !== todoId));
      pushToast(todoId, "Reminder dismissed", "");

      const endpoint = subEndpointRef.current;
      if (endpoint) {
        void sendCancelToServer(endpoint, `snooze::${todoId}`);
        void sendCancelToServer(endpoint, `${todoId}::`);
      }

      const win = window as unknown as { electronAPI?: ElectronAPI };
      if (win.electronAPI?.schedulesRemove) {
        void win.electronAPI.schedulesRemove(`snooze::${todoId}`).catch(() => {});
        void win.electronAPI.schedulesRemove(`${todoId}::`).catch(() => {});
      }

      return;
    }
  }, [scheduleNotify, pushToast]
);

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

    const endpoint = subEndpointRef.current;
    if (endpoint) {
      const payload = {
        title: "Reminder (snoozed)",
        body: `Snoozed ${minutes} min`,
        todoId: todo.id,
        tag: `todo-reminder-${todo.id}`,
      };
      const schedules: ScheduleItem[] = [{ key: newKey, whenMs: newFire, payload }];
      void sendSchedulesToServer(endpoint, schedules);
    }

    setActiveReminders(a => a.filter(x => x.key !== rem.key));
    pushToast(todo.id, `Snoozed ${minutes}m`, `We'll remind you in ${minutes} minutes`);
  }

  function dismiss(rem: FiredReminder) {
    setActiveReminders(a => a.filter(x => x.key !== rem.key));
    void idbDelete(rem.key).catch(() => {});

    const endpoint = subEndpointRef.current;
    if (endpoint) void sendCancelToServer(endpoint, rem.key);
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
        // skip reminders whose remindAt is past
        if (fireAt <= Date.now()) continue;

        const key = makeKey(todo.id, m, fireAt);
        if (timers.current.has(key)) continue; // already scheduled

        const delay = Math.max(0, fireAt - Date.now());
        const timerId = window.setTimeout(() => {
          void doNotify(todo, m === 0 ? "Due now" : `Remind ${m} min before`, key, fireAt);
          timers.current.delete(key);
        }, delay);
        timers.current.set(key, timerId);

        const win = window as unknown as { electronAPI?: ElectronAPI };
        if (win.electronAPI?.schedulesAdd) {
          const payload: SchedulePayload = {
            title: `Reminder: ${todo.text}`,
            body: (m === 0 ? "Due now" : `Remind ${m} min before`) + (todo.due ? ` • Due: ${formatLocal(todo.due)}` : ""),
            todoId: todo.id,
          };
          const schedule: ScheduleItem = { key, whenMs: fireAt, payload };
          void win.electronAPI.schedulesAdd(schedule).catch(e => console.debug("schedulesAdd failed", e));
        } else {
          const endpoint = subEndpointRef.current;
          if (endpoint) {
            const payload = {
              title: `Reminder: ${todo.text}`,
              body: (m === 0 ? "Due now" : `Remind ${m} min before`) + (todo.due ? ` • Due: ${formatLocal(todo.due)}` : ""),
              todoId: todo.id,
              tags: `todo-reminder-${todo.id}`,
            };
            const schedules: ScheduleItem[] = [{ key, whenMs: fireAt, payload }];
            void sendSchedulesToServer(endpoint, schedules);
          }
        }
      }
    }

    function cancelAllFor(todoId: string) {
      for (const key of Array.from(timers.current.keys())) {
        if (key.includes(`::${todoId}::`) || key.startsWith(`snooze::${todoId}::`)) {
          const id = timers.current.get(key)!;
          clearTimeout(id);
          timers.current.delete(key);

          const endpoint = subEndpointRef.current;
          if (endpoint) void sendCancelToServer(endpoint, key);

          const win = window as unknown as { electronAPI?: ElectronAPI };
          if (win.electronAPI?.schedulesRemove) {
            void win.electronAPI.schedulesRemove(key).catch(() => {});
          }
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
        const endpoint = subEndpointRef.current;
        if (endpoint) void sendCancelToServer(endpoint, key);

        const win = window as unknown as { electronAPI?: ElectronAPI };
        if (win.electronAPI?.schedulesRemove) {
          void win.electronAPI.schedulesRemove(key).catch(() => {});
        }
      }
    }

    // reconcile every minute in case of clock changes / new todos added by other tabs
    const reconciler = window.setInterval(() => {
      for (const t of todos) {
        if (t.due && !t.done) scheduleFor(t);
      }
    }, 60_000);

    return () => clearInterval(reconciler);
  }, [todos, enabled, doNotify]);

  return (
    <>
      {/* Small push control for user to opt-in */}
      <div style={{ position: "fixed", right: 12, bottom: 12, display: "flex", flexDirection: "column", gap: 8, zIndex: 9999, maxWidth: 320 }}>
        <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
          {pushEnabled ? (
            <button
              className="btn-plain"
              onClick={() => void disablePushNotifications()}
              disabled={pushBusy}
              aria-pressed="true"
              title="Disable push notifications"
            >
              {pushBusy ? "Turning off..." : "Disable push notifications"}
            </button>
          ) : (
            <button
              className="btn-plain"
              onClick={() => void enablePushNotifications()}
              disabled={pushBusy}
              title="Enable push notifications"
            >
              {pushBusy ? "Enabling..." : "Enable push notifications"}
            </button>
          )}
        </div>
      </div>

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

      {/* Toasts */}
      <div style={{
        position: "fixed", right: 12, bottom: 80,
        display: "flex", flexDirection: "column", gap: 8, zIndex: 9999, maxWidth: 320,
      }}>
        {toasts.slice(0, 3).map(t => (
          <div key={t.uid} className="toast" data-toast-uid={t.uid} style={{
            background: "var(--app-card)", color: "var(--app-text)", padding: "10px 12px",
            borderRadius: 8, boxShadow: "0 6px 20px rgba(2, 6, 23, 0.6)"
          }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>{t.when}</div>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => {
                console.debug("[toast] manual-dismiss", t.uid);
                setToasts(s => s.filter(x => x.uid !== t.uid));
              }} className="btn-plain">Dismiss</button>
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
