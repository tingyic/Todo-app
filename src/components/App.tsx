import { useMemo, useState, useEffect, useRef } from "react";
import { useTodos } from "../hooks/useTodos";
import CelebrateOverlay from "./CelebrationOverlay";
import TodoEditor from "./TodoEditor";
import TodoList from "./TodoList";
import Toolbar from "./Toolbar";
import ReminderManager from "./ReminderManager";
import { haptic, play, isSoundEnabled, setSoundEnabled } from "../utils/sound";

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

  // Sound toggle (backed by utils)
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    try { return isSoundEnabled(); } catch { return true; }
  });
  useEffect(() => {
    try { setSoundEnabled(soundEnabled); } catch { /* empty */ }
  }, [soundEnabled]);

  const [celebrate, setCelebrate] = useState(false);

  // Thanos snap effect for clear completed tasks
  const [dustingIds, setDustingIds] = useState<Set<string>>(new(Set));
  const DUST_DURATION = 900;

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

  // handlers that check availability before acting and show toast + sound/haptic
  function handleUndo() {
    if (!canUndo) return;
    undo();
    showToast("Undone");
    play("undo", true);
  }
  function handleRedo() {
    if (!canRedo) return;
    redo();
    showToast("Redone");
    play("redo", true);
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
          play("undo", true);
        }
      } else if ((mod && shift && key === "z") || (mod && key === "y")) {
        // Ctrl/Cmd+Shift+Z OR Ctrl/Cmd+Y -> redo
        e.preventDefault();
        if (canRedo) {
          redo();
          showToast("Redone");
          play("redo", true);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, canUndo, canRedo]);

  // UI handlers for toggles that play a subtle click sound
  function toggleTheme() {
    setTheme(t => {
      const next = t === "light" ? "dark" : "light";
      play("click", false);
      showToast(next === "dark" ? "Dark theme" : "Light theme", 900);
      return next;
    });
  }
  function toggleReminders() {
    setRemindersEnabled(r => {
      const next = !r;
      play("click", false);
      showToast(next ? "Reminders on" : "Reminders off", 900);
      return next;
    });
  }

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
              onClick={toggleTheme}
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
                onClick={toggleReminders}
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

            {/* SOUND toggle */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 6 }}>
              <button
                onClick={() => {
                  setSoundEnabledState(s => {
                    const next = !s;
                    // write to storage happens in effect
                    // give quick feedback
                    play(next ? "click" : "error", false);
                    showToast(next ? "Sound on" : "Sound off", 900);
                    return next;
                  });
                }}
                className="btn-plain"
                title={soundEnabled ? "Disable sounds" : "Enable sounds"}
                style={{ padding: "6px 10px" }}
              >
                {soundEnabled ? "🔊 Sound" : "🔇 Sound"}
              </button>
            </div>
          </div>
        </header>

        <TodoEditor onAdd={payload => {
          // call add, play add sound and show toast briefly
          add(payload);
          play("add", false);
          showToast("Task added", 900);
        }} />

        <Toolbar
          filter={filter}
          setFilter={setFilter}
          query={query}
          setQuery={setQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          clearCompleted={() => {
            // find completed IDs
            const completedIds = todos.filter(t => t.done).map(t => t.id);
            if (completedIds.length === 0) {
              showToast("No completed tasks to clear", 1000);
              play("error", false);
              return;
            }

            // stage them for dust animation
            setDustingIds(new Set(completedIds));
            // give immediate feedback
            play("whoosh", false);
            haptic([20, 10, 20]);

            // show a small whoosh toast
            showToast(`Clearing ${completedIds.length} completed…`, 1000);

            // after dust animation finishes, actually clear them
            window.setTimeout(() => {
              // clear the backups / actual removal
              clearCompleted(); // call your hook to remove completed items from state
              // cleanup animation flags
              setDustingIds(new Set());
              // final success hint
              play("delete", false);
              showToast("Completed tasks cleared ✨", 1400);
            }, DUST_DURATION);
          }}
          markAll={done => {
            setAll(done);
            play("click", false);
            showToast(done ? "Marked all done" : "Marked all active", 1000);

            if (done) {
              setCelebrate(true);
              play("celebrate-pro", true);
              haptic([50, 30, 50]);
              showToast(" ❤️‍🔥🔥 YOOOOOO lesgooo all tasks completed~ You're a legend 🎊🫡", 2000);
              setTimeout(() => setCelebrate(false), 2000);
            }
          }}
        />

        <main>
          <TodoList
            todos={visible}
            dustingIds={dustingIds}
            onToggle={(id: string, createNext?: boolean | null) => {
              const t = todos.find(x => x.id === id);
              const wasDone = !!t?.done;
              toggle(id, createNext);
              
              if (!wasDone) {
                play("celebrate", true);
                haptic([50, 30, 50]);
                showToast("Yayyyyy lesgoooo task completed weeeee 🎉", 1400);
              } else {
                play("click", false);
                showToast("Marked as not done", 900)
              }
            }}
            onRemove={id => {
              remove(id);
              play("delete", true);
              showToast("Deleted", 900);
            }}
            onUpdate={(id, patch) => {
              update(id, patch);
              play("click", false);
              showToast("Saved", 800);
            }}
          />
        </main>

        <footer className="mt-6 flex items-center justify-between text-sm text-app-muted">
          <div>{stats.total} {stats.total == 1 ? "item" : "items"}</div>
          <div> Have a nice day :)</div>
          <div>Made by reindeer</div>
          <div> Version 1.4.4</div>
        </footer>
      </div>

      <ReminderManager todos={todos} enabled={remindersEnabled} />

      {/* Celebration overlay */}
      {celebrate && <CelebrateOverlay />}

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
