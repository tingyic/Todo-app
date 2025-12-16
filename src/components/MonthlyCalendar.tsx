import { useMemo, useState, useEffect, useCallback } from "react";
import type { AddPayload, Todo } from "../types";
import { parseLocalDateTime, formatLocalDateTime } from "../utils/dates";
import { haptic, play } from "../utils/sound";
import TodoEditor from "./TodoEditor";
// import TodoItem from "./TodoItem";

type Props = {
  todos: Todo[];
  initialDate?: Date;
  onOpenTask?: (id: string) => void;
  onToggle?: (id: string, createNext?: boolean | null) => void;
  onRemove?: (id: string) => void;
  onUpdate?: (id: string, patch: Partial<Todo>, toastMsg?: string) => void;
  onAddTask?: (payload: AddPayload) => void;
};

function pad(n: number) {
  return n < 10 ? `0${n}` : `${n}`;
}

function dateKey(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
}

function monthLabel(d: Date) {
  return d.toLocaleString(undefined, { month: "long", year: "numeric" });
}

function monthPreviewSort(a: Todo, b: Todo) {
    if (a.done !== b.done) {
        return a.done ? 1 : -1;
    }

    const weight = { high: 0, medium: 1, low: 2 } as const;
    return weight[a.priority] - weight[b.priority];
}

function toDateTimeLocal(d: Date) {
  const pad2 = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const yyyy = d.getFullYear();
  const mm = pad2(d.getMonth() + 1);
  const dd = pad2(d.getDate());
  const hh = pad2(d.getHours());
  const min = pad2(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

export default function MonthlyCalendar({ todos, initialDate, onAddTask, onOpenTask, onRemove, onToggle, onUpdate }: Props) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  // current month state: a Date at yyyy-mm-01
  const [monthDate, setMonthDate] = useState<Date>(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const isCurrentMonth = 
    monthDate.getFullYear() === today.getFullYear() && monthDate.getMonth() === today.getMonth();

  // selected day key (YYYY-MM-DD) - default today
  const [selectedKey, setSelectedKey] = useState<string>(() => dateKey(today));
  const [showInlineAdd, setShowInlineAdd] = useState(false);

  const prevMonth = useCallback(() => {
    setMonthDate(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
    play("whoosh", false);
    haptic(15);
  }, []);
  const nextMonth = useCallback(() => {
    setMonthDate(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
    play("whoosh", false);
    haptic(15);
  },[]);
  
  const [showMonthPicker, setShowMonthPicker] = useState(false);
  const [showYearPicker, setShowYearPicker] = useState<number>(() => monthDate.getFullYear());

  // when initialDate changes (rare), sync month/selected
  useEffect(() => {
    if (!initialDate) return;
    setMonthDate(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    setSelectedKey(dateKey(initialDate));
  }, [initialDate]);

  // arrow left/right to scroll between months
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (showMonthPicker) return;

      const k = e.key.toLowerCase();
      if (k === "arrowleft") {
        e.preventDefault();
        prevMonth();
        haptic(15);
      } else if (k === "arrowright") {
        e.preventDefault();
        nextMonth();
        haptic(15);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [prevMonth, nextMonth, showMonthPicker]);

  // decade scroll
  useEffect(()=> {
    if (!showMonthPicker) return;

    function onKey(e: KeyboardEvent) {
      const k = e.key.toLowerCase();

      if (k === "escape") {
        e.preventDefault();
        setShowMonthPicker(false);
        play("click", false);
        haptic(20);
        return;
      }

      if (k === "arrowleft") {
        e.preventDefault();
        setShowYearPicker(y => y - (e.shiftKey ? 10 : 1));
        play("whoosh", false);
        haptic(10);
      }

      if (k === "arrowright") {
        e.preventDefault();
        setShowYearPicker(y => y + (e.shiftKey ? 10 : 1));
        play("whoosh", false);
        haptic(10);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showMonthPicker]);

  // build calendar cells (6 rows x 7 cols = 42 cells)
  const cells = useMemo(() => {
    const year = monthDate.getFullYear();
    const mon = monthDate.getMonth();
    const firstDay = new Date(year, mon, 1);
    const startIdx = firstDay.getDay(); // 0=Sun .. 6=Sat
    const total = 42;
    const res: Date[] = [];
    for (let i = 0; i < total; i++) {
      // day number relative to the month's first date:
      const dayNum = i - startIdx + 1;
      res.push(new Date(year, mon, dayNum));
    }
    return res;
  }, [monthDate]);

  // map todos by day-key
  const todosByDay = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const t of todos) {
      if (!t.due) continue;
      const pd = parseLocalDateTime(t.due);
      if (!pd) continue;
      pd.setHours(0, 0, 0, 0);
      const k = dateKey(pd);
      const arr = map.get(k) ?? [];
      arr.push(t);
      map.set(k, arr);
    }
    return map;
  }, [todos]);

  const tasksForSelected = todosByDay.get(selectedKey) ?? [];

  useEffect(() => {
    setShowInlineAdd(false);
  }, [selectedKey, monthDate]);

  useEffect(() => {
    if (!showInlineAdd) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        setShowInlineAdd(false);
        play("click", false);
        haptic(20);
      }
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [showInlineAdd]);

  function goToday() {
    const t = new Date();
    setMonthDate(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedKey(dateKey(t));
    play("click", false);
    haptic(20);
  }

  function handleEditorAdd(payload: AddPayload) {
    const final: AddPayload = {
      ...payload,
      due: 
        payload.due == null || payload.due === ""
          ? toDateTimeLocal(new Date(selectedKey))
          : payload.due,
    };

    onAddTask?.(final);
    play("add", false);
    haptic(20);
    setShowInlineAdd(false);
  }

  // subtasks
  function handleToggleSubtask(todo: Todo, subtaskId: string) {
    if (!onUpdate) return;
    const subs = todo.subtasks ?? [];
    const s = subs.find(x => x.id === subtaskId);
    const wasDone = !!s?.done;

    const newSubs = subs.map(x => (x.id === subtaskId ? { ...x, done: !x.done } : x));

    onUpdate(todo.id, { subtasks: newSubs }, !wasDone ? "Subtask marked done" : "Subtask marked not done");

    const allDone = newSubs.length > 0 && newSubs.every(x => !!x.done);
    const toggled = newSubs.find(x => x.id === subtaskId);

    if (allDone && !todo.done) {
      if (todo.recurrence) {
        onUpdate(todo.id, { subtasks: newSubs, done: true }, "All subtasks marked done, task marked done");
        play("done", true);
      } else {
        onToggle?.(todo.id);
        play("done", true);
      }
      return;
    }

    // If parent was done but we just unchecked a subtask -> unset parent done
    if (todo.done && toggled && !toggled.done) {
      onUpdate(todo.id, { done: false, subtasks: newSubs }, "Subtask marked not done");
      play("undo", true);
      return;
    }

    // simple feedback sound
    if (toggled?.done) play("done", true);
    else play("undo", true);
  }

  return (
    <div className="monthly-calendar" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Top: Month header + grid */}
      <div className="monthly-top" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="monthly-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn-plain" onClick={prevMonth} aria-label="Previous month">◀</button>

            {!isCurrentMonth && (
                <button className="btn-plain" onClick={goToday} aria-label="Go to today">Today</button>
            )}

            <button className="btn-plain" onClick={nextMonth} aria-label="Next month">▶</button>
          </div>

          <button
            className="btn-plain"
            style={{ fontWeight: 600 }}
            onClick={() => {
              setShowYearPicker(monthDate.getFullYear());
              setShowMonthPicker(true);
              play("click", false);
              haptic(20);
            }}
          >
            {monthLabel(monthDate)}
          </button>

          <div style={{ minWidth: 120, textAlign: "right", color: "var(--app-muted)" }}>
            Click day to view tasks
          </div>
        </div>

        {/* Month picker */}
        {showMonthPicker && (
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            className="month-picker"
            style={{
              width: "min(560px, 96%)",
              borderRadius: 10,
              padding: 12,
              background: "var(--app-card)",
              border: "1px solid var(--app-border)",
              boxShadow: "0 8px 30px rgba(2, 6, 23, 0.08)",
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 12,
            }}
          >
            {/* Year picker row */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <button
                className="btn-plain"
                aria-label="Previous year"
                onClick={() => {
                  setShowYearPicker(y => y - 1);
                  play("whoosh", false);
                  haptic(10);
                }}
              >
                ◀
              </button>

              <div style={{ fontWeight: 700 }}>{showYearPicker}</div>

              <button
                className="btn-plain"
                aria-label="Next year"
                onClick={() => {
                  setShowYearPicker(y => y + 1);
                  play("whoosh", false);
                  haptic(10);
                }}
              >
                ▶
              </button>
            </div>

            {/* Months grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
              {Array.from({ length: 12 }).map((_, m) => {
                const isActive = showYearPicker === monthDate.getFullYear() && m === monthDate.getMonth();
                return (
                  <button
                    key={m}
                    className="btn-plain"
                    onClick={() => {
                      setMonthDate(new Date(showYearPicker, m, 1));
                      setShowMonthPicker(false);
                      play("click", false);
                      haptic(20);
                    }}
                    style={{
                      fontWeight: isActive ? 700 : 500,
                      opacity: isActive ? 1 : 0.85,
                      textAlign: "center",
                      padding: "8px 10px",
                      borderRadius: 8,
                    }}
                  >
                    {new Date(0, m).toLocaleString(undefined, { month: "short" })}
                  </button>
                );
              })}
            </div>

            <div style={{ textAlign: "right", color: "var(--app-muted)", fontSize: 13 }}>
              Use ← → to change year, Shift+←/→ for ±10 years, Esc to close
            </div>
          </div>
        )}

        <div className="monthly-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, minmax(0, 1fr))", gap: 6 }}>
          {/* Day names */}
          {["Sun","Mon","Tue","Wed","Thu","Fri","Sat"].map(dn => (
            <div key={dn} style={{ fontSize: 12, textAlign: "center", color: "var(--app-muted)" }}>{dn}</div>
          ))}

          {cells.map((cell, idx) => {
            const key = dateKey(cell);
            const isCurrentMonth = cell.getMonth() === monthDate.getMonth();
            const isToday = key === dateKey(today);
            const isSelected = key === selectedKey;
            const tasks = todosByDay.get(key) ?? [];
            return (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setSelectedKey(key);
                  play("click", false);
                  haptic(10);
                }}
                className={`mc-day ${isCurrentMonth ? "" : "mc-day-outside"} ${isToday ? "mc-today" : ""} ${isSelected ? "mc-selected" : ""}`}
                style={{
                  minHeight: 64,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 6,
                  borderRadius: 8,
                  maxWidth: "100%",
                  minWidth: 0,
                  overflow: "hidden",
                  border: isSelected ? "1px solid var(--app-accent)" : "1px solid transparent",
                  background: isSelected ? "var(--app-card)" : "transparent",
                  opacity: isCurrentMonth ? 1 : 0.45,
                  cursor: "pointer",
                }}
                aria-pressed={isSelected}
                aria-label={`Day ${cell.getDate()} ${isToday ? "(today)" : ""}, ${tasks.length} tasks`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%", flexWrap: "wrap" }}>
                  <div style={{ fontWeight: isToday ? 700 : 500 }}>{cell.getDate()}</div>
                  {tasks.length ? <div style={{ fontSize: 12 }} className="tag">{tasks.length}</div> : null}
                </div>

                <div style={{ fontSize: 12, color: "var(--app-muted)", width: "100%", display: "flex", gap: 6, flexDirection: "column", overflow: "hidden" }}>
                  {/* show up to 2 task titles as preview */}
                  {tasks
                    .slice()
                    .sort(monthPreviewSort)
                    .slice(0, 2)
                    .map(t => (
                        <span
                            key={t.id}
                            className={
                                t.done
                                ? "mc-task-done"
                                : `prio-${t.priority}`
                            }
                            style={{
                                whiteSpace: "nowrap",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                maxWidth: "100%",
                                minWidth: 0
                            }}
                            title={t.text}
                        >
                            {t.text}
                        </span>
                    ))}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom: Day tasks list */}
      <div className="monthly-bottom" style={{ borderTop: "1px solid var(--app-border)", paddingTop: 8, marginTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
        <div 
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 12,
          }}
        >
          <div style={{ fontWeight: 600 }}>
            {new Date(selectedKey).toLocaleDateString(undefined, {
              weekday: "long",
              month: "short",
              day: "numeric",
              year: "numeric",
            })}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              color: "var(--app-muted)",
              fontSize: 13,
            }}
          >
            <span>
              {tasksForSelected.length}{" "}
              {tasksForSelected.length === 1 ? "task" : "tasks"}
            </span>

            <button
              className="btn-plain"
              aria-label={showInlineAdd ? "Cancel add task" : "Add task for this day"}
              onClick={() => {
                setShowInlineAdd(v => !v);
                play("click", false);
                haptic(20);
              }}
              style={{
                padding: "2px 10px",
                borderRadius: 999,
                border: "1px solid var(--app-border)",
                background: "var(--app-card)",
                fontSize: 14,
                lineHeight: 1,
              }}
            >
              {showInlineAdd ? "Cancel" : "+"}
            </button>
          </div>
        </div>

        {/* Inline add */}
        {showInlineAdd && (
          <TodoEditor
            initialDue={toDateTimeLocal (new Date(selectedKey))}
            onAdd={(payload) => handleEditorAdd(payload)}
          />
        )}

        {tasksForSelected.length === 0 ? (
          <div className="text-center text-slate-400">No tasks for this day</div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
            {tasksForSelected.map(t => {
              const pd = t.due ? parseLocalDateTime(t.due) : null;
              const subs = t.subtasks ?? [];
              const subsTotal = subs.length;
              const doneSubs = t.done ? subsTotal : subs.filter(s => s.done).length;
              const progressPct = subsTotal === 0 ? 0 : Math.round((doneSubs / subsTotal) * 100);

              return (
                <li key={t.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, justifyContent: "space-between", borderRadius: 8, padding: "8px 10px", background: "var(--app-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input
                      aria-label={`Toggle ${t.text}`}
                      type="checkbox"
                      checked={!!t.done}
                      onChange={() => {

                        if(t.recurrence) {
                          if(onUpdate && t.subtasks?.length) {
                            const allDoneSubs = t.subtasks.map(s => ({ ...s, done: true }));
                            onUpdate(t.id, { subtasks: allDoneSubs });
                          }

                          onToggle?.(t.id, null);
                          return;
                        }
                        if (!onUpdate || !t.subtasks || t.subtasks.length === 0) {
                          onToggle?.(t.id);
                          return;
                        }

                        const subs = t.subtasks;

                        if (!t.done) {
                          const newSubs = subs.map(s => ({ ...s, done: true }));

                          onUpdate(
                            t.id,
                            { done: true, subtasks: newSubs },
                            "Yayyyyy lesgoooo task completed weeeee 🎉"
                          );
                          play("celebrate", true);
                          haptic([50, 30, 50]);
                        } else {
                          const newSubs = subs.map(s => 
                            s.done ? s : { ...s, done: false }
                          );
                          
                          onUpdate(
                            t.id,
                            { done: false, subtasks: newSubs },
                            "Task marked not done"
                          );
                          play("undo", true);
                        }
                      }}
                    />
                    
                    <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                      <button className="btn-plain" onClick={() => onOpenTask?.(t.id)} style={{ textAlign: "left", padding: 0 }}>
                        <div className={t.done ? "mc-task-done" : `prio-${t.priority}` } style={{ fontWeight: 600 }}>{t.text}</div>
                      </button>

                      {/* Tags */}
                      {t.tags && t.tags.length > 0 && (
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 6 }}>
                          {t.tags.map(tag => (
                            <span key={tag} className="tag" style={{ fontSize: 12 }}>{tag}</span>
                          ))}
                        </div>
                      )}

                      <div style={{ fontSize: 12, color: "var(--app-muted)" }}>{pd ? formatLocalDateTime(t.due!) : ""}</div>

                      {/* Subtasks progress bar */}
                      {subsTotal > 0 && (
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 8,
                            marginTop: 8,
                            width: "100%",
                          }}
                        >
                          <div
                            className={`subtasks-progress ${t.done ? "todo-done" : ""}`}
                            style={{ flex: 1 }}
                            role="progressbar"
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={progressPct}
                          >
                            <div
                              className="subtasks-progress-fill"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>

                          <div style={{ fontSize: 12, color: "var(--app-muted)", whiteSpace: "nowrap" }}>
                            {doneSubs}/{subsTotal} · {progressPct}%
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Subtasks */}
                  {t.subtasks && t.subtasks.length > 0 && (
                    <div style={{ marginLeft: 32, display: "flex", flexDirection: "column", gap: 6, minWidth: 100 }}>
                      {t.subtasks.map(s => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                          <input
                            type="checkbox"
                            checked={!!s.done}
                            aria-label={`Toggle subtask ${s.text}`}
                            onChange={() => handleToggleSubtask(t, s.id)}
                          />
                          <div
                            className={`subtask-title ${
                              s.priority ? `prio-${s.priority}` : `prio-${t.priority}`
                            } ${s.done ? "subtask-done" : ""}`}
                          >
                            {s.text}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-danger" onClick={() => onRemove?.(t.id)}>Delete</button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
