import { useMemo, useState, useEffect } from "react";
import { useTodos } from "../hooks/useTodos";
import TodoEditor from "./TodoEditor";
import TodoList from "./TodoList";
import Toolbar from "./Toolbar";
import ReminderManager from "./ReminderManager";

export default function App() {
  const { todos, add, toggle, remove, update, clearCompleted, setAll, undo, canUndo } = useTodos();

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

    try { localStorage.setItem("todo-theme", theme); } catch { /* ignore */ }
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

  // Reminders: saved in localStorage (only the ON/OFF toggle)
  const [remindersEnabled, setRemindersEnabled] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem("todo-reminders-enabled");
      return v === null ? true : v === "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try { localStorage.setItem("todo-reminders-enabled", remindersEnabled ? "1" : "0"); } catch { /* ignore */ }
  }, [remindersEnabled]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const mod = isMac ? e.metaKey : e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo]);

  return (
    <div className="min-h-screen bg-app-root flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-3xl bg-app-card rounded-2xl shadow-lg p-6">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">todo or not todo?</h1>

          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            {/* undo hint */}
            <div style={{ fontSize: 12, opacity: 0.8 }}>
              {canUndo ? "Press Ctrl/Cmd+Z to undo" : "No undo available"}
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
          <div> Version 1.2</div>
        </footer>
      </div>

      <ReminderManager todos={todos} enabled={remindersEnabled} />
    </div>
  );
}
