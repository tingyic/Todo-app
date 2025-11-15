import { useMemo, useState, useEffect, useRef } from "react";
import { useTodos } from "../hooks/useTodos";
import TodoEditor from "./TodoEditor";
import TodoList from "./TodoList";
import Toolbar from "./Toolbar";
import ReminderManager from "./ReminderManager";

export default function App() {
  const {
    todos,
    add,
    toggle,
    remove,
    update,
    clearCompleted,
    setAll,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useTodos();

  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "due" | "priority">("created");

  // THEME
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      return (localStorage.getItem("todo-theme") as "light" | "dark") ?? "light";
    } catch {
      return "light";
    }
  });

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") root.classList.add("theme-dark");
    else root.classList.remove("theme-dark");
    try { localStorage.setItem("todo-theme", theme); } catch { /* empty */ }
  }, [theme]);

  const stats = useMemo(() => {
    const total = todos.length;
    const done = todos.filter(t => t.done).length;
    return { total, done, remaining: total - done };
  }, [todos]);

  const visible = useMemo(() => {
    let list = todos.slice();
    if (filter === "active") list = list.filter(t => !t.done);
    if (filter === "completed") list = list.filter(t => t.done);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(t => t.text.toLowerCase().includes(q) || t.tags.join(" ").toLowerCase().includes(q));
    }
    if (sortBy === "due") {
      list.sort((a, b) => {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due!.localeCompare(b.due!);
      });
    } else if (sortBy === "priority") {
      const weight = { high: 0, medium: 1, low: 2 } as const;
      list.sort((a, b) => weight[a.priority] - weight[b.priority]);
    } else {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }, [todos, filter, query, sortBy]);

  // Reminders: persisted toggle
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("todo-reminders-enabled");
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try { localStorage.setItem("todo-reminders-enabled", remindersEnabled ? "1" : "0"); } catch { /* empty */ }
  }, [remindersEnabled]);

  // small toast for feedback (undo/redo)
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  function showToast(msg: string, ms = 1400) {
    setToast(msg);
    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
    }, ms);
  }

  // handlers that check availability before acting and show toast
  function handleUndo() {
    if (!canUndo) return;
    undo();
    showToast("Undone");
  }
  function handleRedo() {
    if (!canRedo) return;
    redo();
    showToast("Redone");
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      // ignore when typing in inputs/textareas/contentEditable elements
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      const shift = e.shiftKey;
      const key = e.key.toLowerCase();

      if (mod && !shift && key === "z") {
        // Ctrl/Cmd+Z -> undo
        e.preventDefault();
        if (canUndo) {
          undo();
          showToast("Undone");
        }
      } else if ( (mod && shift && key === "z") || (mod && key === "y") ) {
        // Ctrl/Cmd+Shift+Z OR Ctrl/Cmd+Y -> redo
        e.preventDefault();
        if (canRedo) {
          redo();
          showToast("Redone");
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, canUndo, canRedo]);

  return (
    <div className="min-h-screen bg-app-root flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-3xl bg-app-card rounded-2xl shadow-lg p-6">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">todo or not todo?</h1>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* Undo / Redo buttons */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={handleUndo}
                className="btn-plain"
                title="Undo (Ctrl/Cmd+Z)"
                disabled={!canUndo}
                style={{ padding: "6px 10px", opacity: canUndo ? 1 : 0.5 }}
                aria-label="Undo"
              >
                ⤺ Undo
              </button>
              <button
                onClick={handleRedo}
                className="btn-plain"
                title="Redo (Ctrl/Cmd+Shift+Z or Ctrl/Cmd+Y)"
                disabled={!canRedo}
                style={{ padding: "6px 10px", opacity: canRedo ? 1 : 0.5 }}
                aria-label="Redo"
              >
                ⤻ Redo
              </button>
            </div>

            <div className="text-sm text-app-muted">{stats.remaining} left • {stats.done} done</div>

            {/* THEME TOGGLE */}
            <button
              onClick={() => setTheme(t => (t === "light" ? "dark" : "light"))}
              aria-label="Toggle theme"
              className="btn-plain"
              title="Toggle theme"
              style={{ padding: "6px 10px" }}
            >
              {theme === "light" ? "🌙 Dark" : "🌤 Light"}
            </button>

            {/* REMINDERS toggle */}
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <button
                onClick={() => setRemindersEnabled(e => !e)}
                className="btn-plain"
                title={remindersEnabled ? "Disable reminders" : "Enable reminders"}
                style={{ padding: "6px 10px" }}
              >
                {remindersEnabled ? "🔔 Reminders On" : "🔕 Reminders Off"}
              </button>
              <div style={{ fontSize: 12, color: "var(--app-muted)" }}>
                {remindersEnabled ? "Per-task reminders enabled" : "Reminders disabled"}
              </div>
            </div>
          </div>
        </header>

        <TodoEditor onAdd={add} />

        <Toolbar
          filter={filter}
          setFilter={setFilter}
          query={query}
          setQuery={setQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          clearCompleted={clearCompleted}
          markAll={setAll}
        />

        <main>
          <TodoList todos={visible} onToggle={toggle} onRemove={remove} onUpdate={update} />
        </main>

        <footer className="mt-6 flex items-center justify-between text-sm text-app-muted">
          <div>{stats.total} items</div>
          <div> Have a nice day :)</div>
          <div>Made by reindeer</div>
          <div> Version 1.3</div>
        </footer>
      </div>

      <ReminderManager todos={todos} enabled={remindersEnabled} />

      {/* Toast: top-right, subtle */}
      {toast && (
        <div
          aria-live="polite"
          style={{
            position: "fixed",
            right: 20,
            top: 20,
            background: "var(--app-card)",
            border: "1px solid var(--app-border)",
            padding: "10px 14px",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(2,6,23,0.06)",
            fontSize: 13,
            color: "var(--app-text)",
            zIndex: 9999,
          }}
        >
          {toast}
        </div>
      )}
    </div>
  );
}
