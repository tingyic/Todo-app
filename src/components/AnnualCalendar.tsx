import { useMemo, useState } from "react";
import type { Todo } from "../types";
import { parseLocalDateTime, formatLocalDateTime } from "../utils/dates";

type Props = {
  year?: number;
  todos: Todo[];
  onOpenTask?: (id: string) => void;
};

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function dateKeyFromDate(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateKeyFromYMD(y: number, m0: number, d: number) {
  return `${y}-${pad(m0 + 1)}-${pad(d)}`;
}

function daysInMonth(year: number, m0: number) {
  return new Date(year, m0 + 1, 0).getDate();
}

function buildIndicatorsForList(list: Todo[]) {
  if (!list || list.length === 0) return [] as ("high" | "medium" | "low" | "completed")[];

  // separate completed from active
  const completedCount = list.filter((t) => t.done).length;
  const active = list.filter((t) => !t.done);

  const highs = active.filter((t) => t.priority === "high").length;
  const meds = active.filter((t) => t.priority === "medium").length;
  const lows = active.filter((t) => t.priority === "low").length;
  const completes = completedCount;

  const totalActive = highs + meds + lows;
  const total = totalActive + completes;
  const slotsTotal = 3;

  // if total <= 3, produce simple list preserving higher-priority first, then completed last
  if (total <= 3) {
    const res: ("high" | "medium" | "low" | "completed")[] = [];
    for (let i = 0; i < highs; i++) res.push("high");
    for (let i = 0; i < meds; i++) res.push("medium");
    for (let i = 0; i < lows; i++) res.push("low");
    for (let i = 0; i < completes; i++) res.push("completed");
    return res;
  }

  // for >3 tasks, allocate slots in priority order: high -> medium -> low -> completed
  const result: ("high" | "medium" | "low" | "completed")[] = [];
  let slots = slotsTotal;

  const take = (count: number, type: "high" | "medium" | "low" | "completed") => {
    const n = Math.min(count, slots);
    for (let i = 0; i < n; i++) {
      result.push(type);
    }
    slots -= n;
  };

  take(highs, "high");
  if (slots > 0) take(meds, "medium");
  if (slots > 0) take(lows, "low");
  if (slots > 0) take(completes, "completed");

  // If we still have slots (edge cases), fill from remaining active in priority order
  if (slots > 0) {
    if (highs > result.filter(r => r === "high").length) take(highs - result.filter(r => r === "high").length, "high");
    if (slots > 0 && meds > result.filter(r => r === "medium").length) take(meds - result.filter(r => r === "medium").length, "medium");
    if (slots > 0 && lows > result.filter(r => r === "low").length) take(lows - result.filter(r => r === "low").length, "low");
    if (slots > 0 && completes > result.filter(r => r === "completed").length) take(completes - result.filter(r => r === "completed").length, "completed");
  }

  // ensure length <= slotsTotal
  return result.slice(0, slotsTotal);
}

export default function AnnualCalendar({ year, todos, onOpenTask }: Props) {
  const now = new Date();
  const Y = year ?? now.getFullYear();

  // map dates -> todos for fast lookup
  const byDate = useMemo(() => {
    const map = new Map<string, Todo[]>();
    for (const t of todos) {
      if (!t.due) continue;
      const d = parseLocalDateTime(t.due);
      if (!d) continue;
      const key = dateKeyFromDate(d);
      const list = map.get(key) ?? [];
      list.push(t);
      map.set(key, list);
    }
    return map;
  }, [todos]);

  const [selectedDay, setSelectedDay] = useState<{ key: string; date: Date } | null>(null);

  const openDay = (key: string, date: Date) => {
    setSelectedDay({ key, date });
  };

  const closeDay = () => setSelectedDay(null);

  return (
    <div className="annual-calendar">
      <div className="annual-header" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <h2 style={{ margin: 0 }}>Year — {Y}</h2>
        <div style={{ color: "var(--app-muted)", fontSize: 13 }}>Click a day to view tasks</div>
      </div>

      <div className="months-grid">
        {Array.from({ length: 12 }).map((_, m0) => {
          const days = daysInMonth(Y, m0);
          const firstWeekday = new Date(Y, m0, 1).getDay(); // 0 Sun .. 6 Sat
          // produce blank placeholders + day numbers
          const cells: (null | number)[] = Array.from({ length: firstWeekday }).map(() => null);
          for (let d = 1; d <= days; d++) cells.push(d);

          return (
            <div key={m0} className="month-card bg-app-card" style={{ padding: 10 }}>
              <div className="month-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {new Date(Y, m0, 1).toLocaleString(undefined, { month: "short", year: "numeric" })}
                </div>
                <div style={{ color: "var(--app-muted)", fontSize: 12 }}>{days}d</div>
              </div>

              <div className="weekday-labels" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginTop: 8, fontSize: 11, color: "var(--app-muted)" }}>
                {["S","M","T","W","T","F","S"].map(w => <div key={w} style={{ textAlign: "center" }}>{w}</div>)}
              </div>

              <div className="days-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginTop: 8 }}>
                {cells.map((v, idx) => {
                  if (v === null) return <div key={idx} className="day-cell empty" />;
                  const key = dateKeyFromYMD(Y, m0, v);
                  const list = byDate.get(key) ?? [];
                  const isToday = key === dateKeyFromDate(new Date());
                  const cls = `day-cell ${list.length ? "has-todos" : ""} ${isToday ? "is-today" : ""}`;
                  const indicators = buildIndicatorsForList(list);
                  return (
                    <button
                      key={idx}
                      type="button"
                      className={cls}
                      title={list.length ? `${list.length} task(s)` : ""}
                      onClick={() => openDay(key, new Date(Y, m0, v))}
                      aria-pressed={selectedDay?.key === key}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div style={{ fontSize: 12 }}>{v}</div>
                        {indicators.length > 0 && (
                          <div className="day-dots" aria-hidden style={{ display: "flex", gap: 4, marginTop: 6 }}>
                            {indicators.map((p, i) => (
                              <span
                                key={`${key}-dot-${i}`}
                                className={`dot prio-${p}`}
                                aria-hidden
                                title={p}
                                style={{ 
                                    width: 8,
                                    height: 8,
                                    borderRadius: 999,
                                    display: "inline-block",
                                }}
                            />
                            ))}
                          </div>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* day details popup */}
      {selectedDay && (
        <div className="calendar-day-popup" role="dialog" aria-modal="true" onClick={closeDay}>
          <div className="calendar-day-panel" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div style={{ fontWeight: 700 }}>{selectedDay.date.toLocaleDateString()}</div>
              <button className="btn-plain" onClick={closeDay}>Close</button>
            </div>

            <div style={{ marginTop: 10 }}>
              {(byDate.get(selectedDay.key) ?? []).length === 0 ? (
                <div style={{ color: "var(--app-muted)" }}>No tasks for this day</div>
              ) : (
                (byDate.get(selectedDay.key) ?? []).map(t => (
                  <div 
                    key={t.id} 
                    className={`snooze-card ${t.done ? "task-completed" : ""}`} 
                    style={{ marginTop: 8, padding: 8, cursor: "pointer" }} 
                    onClick={() => { onOpenTask?.(t.id); closeDay() }}
                  >
                    <div style={{ fontWeight: 700 }} className={t.done ? "prio-completed" : `prio-${t.priority}`}>{t.text}</div>
                    <div style={{ color: "var(--app-muted)", fontSize: 12, marginTop: 6 }}>
                      {t.due ? formatLocalDateTime(t.due) : new Date(t.createdAt).toLocaleString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
