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

export default function ReminderManager({ todos, enabled = true }: Props) {
  const timers = useRef<Map<string, number>>(new Map()); // key => timerId
  const [toasts, setToasts] = useState<Array<{ id: string; title: string; when: string }>>([]);

  // fired/triggered reminders that can be snoozed/dismissed
  const [activeReminders, setActiveReminders] = useState<FiredReminder[]>([]);
  
  const permissionRef = useRef<NotificationPermission | null>(null);

  useEffect(() => {
    permissionRef.current = typeof Notification !== "undefined" ? Notification.permission : null;
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

  // doNotify wrapped in useCallback so effect deps are stable (eslint happy)
  const doNotify = useCallback((todo: Todo, label: string, key: string, fireTime: number) => {
    setActiveReminders(r => [
      ...r,
      { key, todo, label, fireTime }
    ]);
    const title = `Reminder: ${todo.text}`;
    const bodyParts: string[] = [];
    if (todo.due) bodyParts.push(`Due: ${formatLocal(todo.due)}`);
    if (todo.tags?.length) bodyParts.push(`Tags: ${todo.tags.join(", ")}`);
    const body = [label, ...bodyParts].join(" • ");

    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        // NotificationOptions in lib.dom may not include some keys in older TS versions;
        // cast to any to be safe — this is only passed to browser API.
        const opts: NotifOpts = { body, tag: `todo-reminder-${todo.id}`, renotify: true};
        const n = new Notification(title, opts);
        n.onclick = () => (window.focus(), n.close());
        return;
      } catch {
        // fall through to in-app toast if creation fails
      }
    }

    pushToast(todo.id, title, body);
    if (permissionRef.current === "default") setTimeout(() => void requestPermission(), 1000);
  }, [pushToast]);

  // Snooze handler
  function snooze(rem: FiredReminder, minutes: number) {
    const todo = rem.todo;
    if (!todo) {
      setActiveReminders(a => a.filter(x => x.key !== rem.key));
      return;
    }

    const newFire = Date.now() + minutes * 60_000;
    const newKey = `${todo.id}::snooze${minutes}::${newFire}`;

    const delay = Math.max(0, newFire - Date.now());
    const timerId = window.setTimeout(() => {
      doNotify(todo, `Snoozed ${minutes} min`, newKey, newFire);
      timers.current.delete(newKey);
    }, delay);

    timers.current.set(newKey, timerId);

    setActiveReminders(a => a.filter(x => x.key !== rem.key));
  }

  function dismiss(rem: FiredReminder) {
    setActiveReminders(a => a.filter(x => x.key !== rem.key));
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
          doNotify(todo, m === 0 ? "Due now" : `Remind ${m} min before`, key, fireAt);
          timers.current.delete(key);
        }, delay);
        timers.current.set(key, timerId);
      }
    }

    function cancelAllFor(todoId: string) {
      for (const key of Array.from(timers.current.keys())) {
        if (key.startsWith(`${todoId}::`)) {
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
      const [todoId] = key.split("::");
      if (!currentIds.has(todoId)) {
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
          <div key={t.id} className="toast" style={{
            background: "#111827", color: "#fff", padding: "10px 12px",
            borderRadius: 8, boxShadow: "0 6px 20px rgba(2,6,23,0.6)"
          }}>
            <div style={{ fontWeight: 700, fontSize: 13 }}>{t.title}</div>
            <div style={{ fontSize: 12, opacity: 0.9, marginTop: 6 }}>{t.when}</div>
            <div style={{ marginTop: 8, display: "flex", justifyContent: "flex-end" }}>
              <button onClick={() => setToasts(s => s.filter(x => x.id !== t.id))} style={{ background: "transparent", color: "#9ca3af", border: "none", cursor: "pointer" }}>Dismiss</button>
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
