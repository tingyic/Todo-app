import { useMemo, useState, useEffect } from "react";
import type { Todo } from "../types";
import { parseLocalDateTime, formatLocalDateTime } from "../utils/dates";

type Props = {
  todos: Todo[];
  initialDate?: Date;
  onOpenTask?: (id: string) => void;
  onToggle?: (id: string, createNext?: boolean | null) => void;
  onRemove?: (id: string) => void;
  onUpdate?: (id: string, patch: Partial<Todo>, toastMsg?: string) => void;
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

export default function MonthlyCalendar({ todos, initialDate, onOpenTask, onToggle, onRemove, onUpdate }: Props) {
  const today = useMemo(() => {
    const t = new Date();
    t.setHours(0,0,0,0);
    return t;
  }, []);

  // current month state: a Date at yyyy-mm-01
  const [monthDate, setMonthDate] = useState<Date>(() => {
    const d = initialDate ? new Date(initialDate) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  // selected day key (YYYY-MM-DD) - default today
  const [selectedKey, setSelectedKey] = useState<string>(() => dateKey(today));

  // when initialDate changes (rare), sync month/selected
  useEffect(() => {
    if (!initialDate) return;
    setMonthDate(new Date(initialDate.getFullYear(), initialDate.getMonth(), 1));
    setSelectedKey(dateKey(initialDate));
  }, [initialDate]);

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
      pd.setHours(0,0,0,0);
      const k = dateKey(pd);
      const arr = map.get(k) ?? [];
      arr.push(t);
      map.set(k, arr);
    }
    return map;
  }, [todos]);

  const tasksForSelected = todosByDay.get(selectedKey) ?? [];

  function prevMonth() {
    setMonthDate(m => new Date(m.getFullYear(), m.getMonth() - 1, 1));
  }
  function nextMonth() {
    setMonthDate(m => new Date(m.getFullYear(), m.getMonth() + 1, 1));
  }
  function goToday() {
    const t = new Date();
    setMonthDate(new Date(t.getFullYear(), t.getMonth(), 1));
    setSelectedKey(dateKey(t));
  }

  return (
    <div className="monthly-calendar" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {/* Top: Month header + grid */}
      <div className="monthly-top" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div className="monthly-header" style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="btn-plain" onClick={prevMonth} aria-label="Previous month">◀</button>
            <button className="btn-plain" onClick={goToday} aria-label="Go to today">Today</button>
            <button className="btn-plain" onClick={nextMonth} aria-label="Next month">▶</button>
          </div>

          <div style={{ fontWeight: 600 }}>{monthLabel(monthDate)}</div>

          <div style={{ minWidth: 120, textAlign: "right", color: "var(--app-muted)" }}>
            Click day to view tasks
          </div>
        </div>

        <div className="monthly-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 6 }}>
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
                onClick={() => setSelectedKey(key)}
                className={`mc-day ${isCurrentMonth ? "" : "mc-day-outside"} ${isToday ? "mc-today" : ""} ${isSelected ? "mc-selected" : ""}`}
                style={{
                  minHeight: 64,
                  padding: 8,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: 6,
                  borderRadius: 8,
                  border: isSelected ? "1px solid var(--app-accent)" : "1px solid transparent",
                  background: isSelected ? "var(--app-card)" : "transparent",
                  opacity: isCurrentMonth ? 1 : 0.45,
                  cursor: "pointer",
                }}
                aria-pressed={isSelected}
                aria-label={`Day ${cell.getDate()} ${isToday ? "(today)" : ""}, ${tasks.length} tasks`}
              >
                <div style={{ display: "flex", justifyContent: "space-between", width: "100%" }}>
                  <div style={{ fontWeight: isToday ? 700 : 500 }}>{cell.getDate()}</div>
                  {tasks.length ? <div style={{ fontSize: 12 }} className="tag">{tasks.length}</div> : null}
                </div>

                <div style={{ fontSize: 12, color: "var(--app-muted)", width: "100%", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {/* show up to 2 task titles as preview */}
                  {tasks.slice(0,2).map(t => <span key={t.id} style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.text}</span>)}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bottom: Day tasks list */}
      <div className="monthly-bottom" style={{ borderTop: "1px solid var(--app-border)", paddingTop: 8, marginTop: 4, display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontWeight: 600 }}>
            {new Date(selectedKey).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric", year: "numeric" })}
          </div>
          <div style={{ color: "var(--app-muted)", fontSize: 13 }}>
            {tasksForSelected.length} {tasksForSelected.length === 1 ? "task" : "tasks"}
          </div>
        </div>

        {tasksForSelected.length === 0 ? (
          <div className="text-center text-slate-400">No tasks for this day</div>
        ) : (
          <ul style={{ display: "flex", flexDirection: "column", gap: 8, listStyle: "none", padding: 0, margin: 0 }}>
            {tasksForSelected.map(t => {
              const pd = t.due ? parseLocalDateTime(t.due) : null;
              return (
                <li key={t.id} style={{ display: "flex", alignItems: "center", gap: 10, justifyContent: "space-between", borderRadius: 8, padding: "8px 10px", background: "var(--app-card)" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <input aria-label={`Toggle ${t.text}`} type="checkbox" checked={!!t.done} onChange={() => onToggle?.(t.id)} />
                    <div style={{ display: "flex", flexDirection: "column" }}>
                      <button className="btn-plain" onClick={() => onOpenTask?.(t.id)} style={{ textAlign: "left", padding: 0 }}>
                        <div style={{ fontWeight: 600 }}>{t.text}</div>
                      </button>
                      <div style={{ fontSize: 12, color: "var(--app-muted)" }}>{pd ? formatLocalDateTime(t.due!) : ""}</div>
                    </div>
                  </div>

                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-plain" onClick={() => onUpdate?.(t.id, { done: !t.done }, t.done ? "Marked not done" : "Marked done")}>Toggle</button>
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
