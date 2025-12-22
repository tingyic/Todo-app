import { haptic, play, isSoundEnabled, setSoundEnabled } from "../utils/sound";
import React, { useMemo, useState, useEffect, useRef, useCallback } from "react";
import { useTodos } from "../hooks/useTodos";
import AnnualCalendar, { type ImperativeCalendarHandle } from "./AnnualCalendar";
import CelebrateOverlay from "./CelebrationOverlay";
import HelpButton from "./HelpButton";
import MonthlyCalendar from "./MonthlyCalendar";
import ReminderManager from "./ReminderManager";
import TodoEditor from "./TodoEditor";
import TodoList from "./TodoList";
import Toolbar from "./Toolbar";
import WeeklyCalendar from "./WeeklyCalendar";

export default function App() {
  const {
    todos,
    add,
    toggle,
    remove,
    update,
    clearCompleted,
    setAll,
    setTodos,
    undo,
    redo,
    canUndo,
    canRedo,
  } = useTodos();

  const calRef = useRef<ImperativeCalendarHandle | null>(null);

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const [view, setView] = useState<"list" | "year" | "month" | "week">("list");
  
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

  // Sound toggle
  const [soundEnabled, setSoundEnabledState] = useState<boolean>(() => {
    try { return isSoundEnabled(); } catch { return true; }
  });
  useEffect(() => {
    try { setSoundEnabled(soundEnabled); } catch { /* empty */ }
  }, [soundEnabled]);

  const [celebrate, setCelebrate] = useState(false);

  // Thanos snap effect for clear completed tasks
  const [dustingIds, setDustingIds] = useState<Set<string>>(() => new Set<string>());
  const DUST_DURATION = 900;

  // small toast for feedback (undo/redo)
  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<number | null>(null);

  const showToast = useCallback((msg: string, ms = 1400) => {
    setToast(msg);

    try {
      document.body.classList.add("toast-visible");
    } catch {/* Empty */}

    if (toastTimerRef.current) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
    toastTimerRef.current = window.setTimeout(() => {
      setToast(null);
      toastTimerRef.current = null;
      try {
        document.body.classList.remove("toast-visible");
      } catch {/* Empty */}
    }, ms);
  }, []);

  const handleToggleWithFeedback = useCallback(
    (id: string, createNext?: boolean | null) => {
      const t = todos.find(x => x.id === id);
      const wasDone = !!t?.done;

      toggle(id, createNext);

      if (!wasDone) {
        play("celebrate", true);
        haptic([50, 30, 50]);
        showToast("Yayyyyy lesgoooo task completed weeeee 🎉", 1400);
      } else {
        play("click", false);
        showToast("Marked as not done", 900);
      }
    },
    [todos, toggle, showToast]
  );

  const cardRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<"list" | "year" | "month" | "week">(view);
  useEffect(() => {
    viewRef.current = view;
  }, [view]);

  const viewDragStartX = useRef<number | null>(null);
  const viewDragStartY = useRef<number | null>(null);
  const viewDraggingRef = useRef(false);
  const viewSwipeLockedRef = useRef(false);
  const [viewDragX, setViewDragX] = useState(0);

  const VIEW_MIN = -220;
  const VIEW_MAX = 220;
  const VIEW_SWIPE_THRESHOLD = 100;

  function isInteractiveTarget(t: EventTarget | null) {
    const elem = t as Element | null;
    if (!elem) return false;
    const tag = (elem.tagName || "").toLowerCase();
    const interactiveTags = ["button", "input", "select", "a", "textarea", "label"];
    if (interactiveTags.includes(tag)) return true;
    if (elem.closest && !!elem.closest(".todo-item")) return true;
    return false;
  }

  function onViewPointerDown(e: React.PointerEvent) {
    if (isInteractiveTarget(e.target)) return;

    if (viewRef.current === "year" && document.querySelector(".calendar-day-panel")) return;

    viewDragStartX.current = e.clientX;
    viewDragStartY.current = e.clientY;
    viewDraggingRef.current = true;
    viewSwipeLockedRef.current = false;
    setViewDragX(0);

    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {/* empty */}
  }

  function onViewPointerMove(e: React.PointerEvent) {
    if (!viewDraggingRef.current || viewDragStartX.current === null || viewDragStartY.current === null) return;

    const dx = e.clientX - viewDragStartX.current;
    const dy = e.clientY - viewDragStartY.current;

    if (!viewSwipeLockedRef.current && Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
      viewSwipeLockedRef.current = true;
      viewDraggingRef.current = false;
      viewDragStartX.current = null;
      setViewDragX(0);
      try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {/* empty */}
      return;
    }

    if (viewSwipeLockedRef.current) return;

    const clamped = Math.max(VIEW_MIN, Math.min(VIEW_MAX, dx));
    setViewDragX(clamped);
  }

  function onViewPointerUp(e: React.PointerEvent) {
    if (!viewDraggingRef.current) {
      viewDragStartX.current = null;
      viewDragStartY.current = null;
      setViewDragX(0);
      return;
    }
    viewDraggingRef.current = false;

    // release pointer capture
    try { (e.target as Element).releasePointerCapture?.(e.pointerId); } catch {/* empty */}

    const dx = viewDragStartX.current === null ? 0 : e.clientX - viewDragStartX.current;
    viewDragStartX.current = null;
    viewDragStartY.current = null;

    if (viewRef.current === "list" && dx <= -VIEW_SWIPE_THRESHOLD) {
      setViewWithFeedback("year");
      setViewDragX(0);
      return;
    }

    if (viewRef.current === "year" && dx >= VIEW_SWIPE_THRESHOLD) {
      if (!document.querySelector(".calendar-view-panel")) {
        setViewWithFeedback("list");
      } else {
        // blocked
        play("error", false);
      }
      setViewDragX(0);
      return;
    }

    if (viewRef.current === "list" && dx >= VIEW_SWIPE_THRESHOLD) {
      setViewWithFeedback("month");
      setViewDragX(0);
      return;
    }

    if (viewRef.current === "month" && dx <= -VIEW_SWIPE_THRESHOLD) {
      setViewWithFeedback("list");
      setViewDragX(0);
      return;
    }

    // if movement not enough, return to original position, and do nothing
    setViewDragX(0);
  }

  const setViewWithFeedback = useCallback((v:  "list" | "year" | "month" | "week") => {
    setView(v);
    play("click", false);
    try {haptic(25);} catch {/* empty */}
    showToast(v === "year" ? "Year view" : v === "month" ? "Month view" : v === "week" ? "Week view" : "List view", 700);
  }, [showToast])

  useEffect(() => {
    if (toast) {
      const t = window.setTimeout(() => {
        const el = document.querySelector<HTMLElement>('.toast');
        if (el) {
          const height = el.getBoundingClientRect().height;
          document.body.style.setProperty('--toast-offset', `${Math.ceil(height + 12)}px`);
        } else {
          document.body.style.setProperty('--toast-offset', `86px`);
        }
        document.body.classList.add('toast-visible');
      }, 0);

      return () => {
        clearTimeout(t);
      };
    } else {
      document.body.style.removeProperty('--toast-offset');
      document.body.classList.remove('toast-visible');
    }
  }, [toast]);

  const toggleTheme = useCallback(() => {
    setTheme(t => {
      const next = t === "light" ? "dark" : "light";
      play("click", false);
      showToast(next === "dark" ? "Dark theme" : "Light theme", 900);
      return next;
    });
  }, [showToast]);

  const toggleReminders = useCallback(() => {
    setRemindersEnabled(r => {
      const next = !r;
      play("click", false);
      showToast(next ? "Reminders on" : "Reminders off", 900);
      return next;
    });
  }, [showToast]);

  const toggleSound = useCallback(() => {
    setSoundEnabledState(s => {
      const next = !s;
      play(next ? "click" : "error", false);
      showToast(next ? "Sound on" : "Sound off", 900);
      return next;
    });
  }, [showToast]);

  // Add tasks directly from monthly calendar view
  const [showAddModal, setShowAddModal] = useState(false);
  const [addModalDate, setAddModalDate] = useState<Date | null>(null);

  function toDateTimeLocal(d: Date) {
    const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
    const now = new Date();
    const hh = pad(now.getHours());
    const mm = pad(now.getMinutes());
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${hh}:${mm}`;
  }

  const setFilterWithFeedback = useCallback((f: "all" | "active" | "completed") => {
    setFilter(f);
    const msg = f === "all" 
      ? "Filter: All tasks"
      : f === "active" 
      ? "Filter: Active tasks"
      : "Filter: Completed tasks";
    showToast(msg, 700);
    play("click", false);
  }, [showToast]);

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

  // autosave (for desktop app)
  useEffect(() => {
    const onBeforeUnload = () => {
      try {
        window.__APP_AUTOSAVE_HANDLE?.syncFlush();
      } catch (e) {
        console.error("Final autosave flush failed:", e);
      }
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, []);

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

      if ((key === "arrowleft" || key === "arrowright") && view === "year") {
        if (document.querySelector(".calendar-day-panel")) {
          // do nothing
        } else {
          e.preventDefault();
          if (key === "arrowleft") calRef.current?.prev?.();
          else calRef.current?.next?.();
          return;
        }
      }

      switch (key) {
        case "t": {
          // Theme toggle (T for theme)
          e.preventDefault();
          toggleTheme();
          break;
        }
        case "s": {
          // Sound toggle (S for sound)
          e.preventDefault();
          toggleSound();
          break;
        }
        case "a": {
          // Reminder toggle (A for alarms)
          e.preventDefault();
          toggleReminders();
          break;
        }
        case "j": {
          // Filter: all
          setFilterWithFeedback("all");
          break;
        }
        case "k": {
          // Filter: active tasks
          e.preventDefault();
          setFilterWithFeedback("active");
          break;
        }
        case "l": {
          // Filter: completed tasks
          e.preventDefault();
          setFilterWithFeedback("completed");
          break;
        }
        case "arrowup": {
          // move selection up in the visible task list
          e.preventDefault();
          if (!visible.length) return;
          if (!selectedId) {
            // select last
            setSelectedId(visible[visible.length - 1].id);
            showToast("Selected task", 700);
            return;
          }
          const idx = visible.findIndex(t => t.id === selectedId);
          if (idx === -1) {
            setSelectedId(visible[0].id);
            showToast("Selected task", 700);
            return;
          }
          const prev = (idx - 1 + visible.length) % visible.length;
          setSelectedId(visible[prev].id);
          break;
        }
        case "arrowdown": {
          // move selection down in the visible task list
          e.preventDefault();
          if (!visible.length) return;
          if (!selectedId) {
            setSelectedId(visible[0].id);
            showToast("Selected task", 700);
            return;
          }
          const idx = visible.findIndex(t => t.id === selectedId);
          if (idx === -1) {
            setSelectedId(visible[0].id);
            showToast("Selected task", 700);
            return;
          }
          const next = (idx + 1) % visible.length;
          setSelectedId(visible[next].id);
          break;
        }
        default:
          break;
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, canUndo, canRedo, toggleTheme, toggleReminders, toggleSound, setFilterWithFeedback, showToast, visible, selectedId, view]);

  return (
    <div className="min-h-screen bg-app-root flex items-start justify-center py-12 px-4">
      <div 
        ref={cardRef}
        className="w-full max-w-3xl bg-app-card rounded-2xl shadow-lg p-6 view-swipe-surface"
        onPointerDown={onViewPointerDown}
        onPointerMove={onViewPointerMove}
        onPointerUp={onViewPointerUp}
        onPointerCancel={onViewPointerUp}
      >
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

            {/* VIEW TOGGLE */}
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginLeft: 6}}>
              <button 
                className="btn-plain"
                onClick={() => setViewWithFeedback("list")}
                aria-pressed={view === "list"}
                title="List view"
                style={{ padding: "6px 10px" }}
              >
                List
              </button>

              <button
                className="btn-plain"
                onClick={() => setViewWithFeedback("year")}
                aria-pressed={view === "year"}
                title="Year view"
                style={{ padding: "6px 10px" }}
              >
                Year
              </button>

              <button
                className="btn-plain"
                onClick={() => setViewWithFeedback("month")}
                aria-pressed={view === "month"}
                title="Month view"
                style={{ padding: "6px 10px" }}
              >
                Month
              </button>

              <button
                className="btn-plain"
                onClick={() => setViewWithFeedback("week")}
                aria-pressed={view === "week"}
                title="Week view"
                style={{ padding: "6px 10px" }}
              >
                Week
              </button>
            </div>

            {/* View swipe */}
            <div
              className={`view-swipe-hint ${viewDragX < 0 ? "to-year" : viewDragX > 0 ? "to-list" : ""}`}
              style={{
                transform: `translateX(${viewDragX}px)`,
                opacity: Math.min(1, Math.abs(viewDragX) / 30),
                display: Math.abs(viewDragX) > 6 ? "flex" : "none",
                alignItems: "center",
                gap: 8,
                marginLeft: 8,
              }}
              aria-hidden
            >
              <span className="icon">{view === "list" ? "📅" : "📋"}</span>
              <span className="label">{view === "list" ? "Year view" : "List view"}</span>
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
          setFilter={setFilterWithFeedback}
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
              clearCompleted();
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
          todos={todos}
          setTodos={setTodos}
          showToast={showToast}
          view={view}
          setView={setViewWithFeedback}
        />

        {showAddModal && (
          <div
            className="modal-overlay"
            onClick={() => setShowAddModal(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 3000,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "var(--app-card)",
              padding: 16,
            }}
          >
            <div
              role="dialog"
              aria-modal="true"
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(760px, 96%)",
                borderRadius: 12,
                padding: 16,
                background: "var(--app-card)",
                border: "1px solid var(--app-border)",
                boxShadow: "0 12px 40px rgba(2, 6, 23, 0.12)",
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontWeight: 700 }}>
                  Add task - {addModalDate ? addModalDate.toLocaleDateString() : ""}
                </div>
                <div>
                  <button className="btn-plain" onClick={() => { setShowAddModal(false); }}>
                    ✕
                  </button>
                  </div>
              </div>

              <TodoEditor
                initialDue={addModalDate ? toDateTimeLocal(addModalDate) : undefined}
                onAdd={(payload) => {
                  add(payload);
                  play("add", false);
                  showToast("Task added", 900);
                  setShowAddModal(false);
                  setAddModalDate(null);
                }}
              />

              <div style={{ textAlign: "right", marginTop: 8 }}>
                <button className="btn-plain" onClick={() => setShowAddModal(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

        <main>
          {view === "list" ? (
            <TodoList
              todos={visible}
              dustingIds={dustingIds}
              selectedId={selectedId}
              setSelectedId={setSelectedId}
              showToast={showToast}
              onToggle={handleToggleWithFeedback}
              onRemove={id => {
                setSelectedId(prev => (prev === id ? null : prev));
                remove(id);
                play("delete", true);
                showToast("Deleted", 900);
              }}
              onUpdate={(id, patch, toastMsg) => {
                update(id, patch);
                play("click", false);
                showToast(toastMsg ?? "Saved", 800);
              }}
            />
          ) : view === "year" ? (
            <AnnualCalendar
              ref={calRef}
              todos={todos}
              onOpenTask={(id) => {
                setViewWithFeedback("list");
                setSelectedId(id);
                showToast("Opened task in list", 800);
              }}
            />
          ) : view === "month" ? (
            <MonthlyCalendar
              todos={todos}
              onAddTask={(payload) => {
                add(payload);
                play("add", false);
                showToast("Task added", 900);
              }}
              onOpenTask={(id) => {
                // reuse same behavior as annual calendar -> open list + focus task
                setViewWithFeedback("list");
                setSelectedId(id);
                showToast("Opened task in list", 800);
              }}
              onToggle={handleToggleWithFeedback}
              onRemove={(id) => {
                remove(id);
                play("delete", true);
                showToast("Deleted", 900);
              }}
              onUpdate={(id, patch, toastMsg) => {
                update(id, patch);
                play("click", false);
                showToast(toastMsg ?? "Saved", 800);
              }}
            />
          ) : view === "week" ? (
            <WeeklyCalendar />
          ) : null}
        </main>
        
        <footer className="mt-6 flex items-center justify-between text-sm text-app-muted">
          <div>{stats.total} {stats.total === 1 ? "item" : "items"}</div>
          <div> Have a nice day :)</div>
          <div>
            Made by{" "}
            <a 
              href="https://www.youtube.com/watch?v=dQw4w9WgXcQ"
              target="_blank"
              rel="noopener noreferrer"
              style={{
                color: "inherit",
                textDecoration: "none",
                cursor: "pointer",
              }}
            >
              reindeer
            </a>
          </div>
          <div> Version 2.3.1</div>
        </footer>
      </div>

      <ReminderManager todos={todos} enabled={remindersEnabled} />

      {/* Celebration overlay */}
      {celebrate && <CelebrateOverlay />}

      {/* Toast: top-right, subtle */}
      {toast && (
        <div
          className="toast"
          aria-live="polite"
          style={{
            position: "fixed",
            right: 20,
            top: 20,
            background: "var(--app-card)",
            border: "1px solid var(--app-border)",
            padding: "10px 14px",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(2, 6, 23, 0.06)",
            fontSize: 13,
            color: "var(--app-text)",
            zIndex: 9999,
          }}
        >
          {toast}
        </div>
      )}

      <HelpButton />
    </div>
  );
}
