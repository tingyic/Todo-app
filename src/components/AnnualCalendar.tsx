import { forwardRef, useEffect, useMemo, useRef, useImperativeHandle, useState, useCallback } from "react";
import type { Todo } from "../types";
import { parseLocalDateTime, formatLocalDateTime } from "../utils/dates";
import { play, haptic } from "../utils/sound";

type Props = {
  year?: number;
  todos: Todo[];
  onOpenTask?: (id: string) => void;
};

export type ImperativeCalendarHandle = {
  prev: () => void;
  next: () => void;
  goToCurrent?: () => void;
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

  // If still have slots, fill from remaining active in priority order
  if (slots > 0) {
    const curHighs = result.filter(r => r === "high").length;
    const curMeds = result.filter(r => r === "medium").length;
    const curLows = result.filter(r => r === "low").length;
    const curCompletes = result.filter(r => r === "completed").length;

    if (highs > curHighs) take(highs - curHighs, "high");
    if (slots > 0 && meds > curMeds) take(meds - curMeds, "medium");
    if (slots > 0 && lows > curLows) take(lows - curLows, "low");
    if (slots > 0 && completes > curCompletes) take(completes - curCompletes, "completed");
  }

  // ensure length <= slotsTotal
  return result.slice(0, slotsTotal);
}

function getSubtaskProgress(todo: Todo) {
  const subs = todo.subtasks ?? [];
  if (subs.length === 0) return;

  const doneCount = todo.done
    ? subs.length
    : subs.filter(s => s.done).length;

  const pct = Math.round((doneCount / subs.length) * 100);
  return { doneCount, total: subs.length, pct };
}

const AnnualCalendar = forwardRef<ImperativeCalendarHandle, Props>(({ year, todos, onOpenTask }, ref) => {
  const now = useMemo(() => new Date(), []);
  const LOWER_YEAR = 1900;
  const UPPER_YEAR = 9999;
  const [currentYear, setCurrentYear] = useState<number>(year ?? now.getFullYear());
  const [yearInput, setYearInput] = useState<string>(String(currentYear));

  useEffect(() => {
    if (typeof year === "number") {
      const clamped = Math.max(LOWER_YEAR, Math.min(UPPER_YEAR, Math.floor(year)));
      setCurrentYear(clamped);
      setYearInput(String(clamped));
    }
  }, [year]);

  useEffect(() => {
    setYearInput(String(currentYear));
  }, [currentYear]);

  useImperativeHandle(ref, () => ({
    prev: () => {
      setCurrentYear(y => Math.max(LOWER_YEAR, y - 1));
      play("whoosh", false);
      haptic([10]);
    },
    next: () => {
      setCurrentYear(y => Math.min(UPPER_YEAR, y + 1));
      play("whoosh", false);
      haptic([10]);
    },
    goToCurrent: () => {
      setCurrentYear(now.getFullYear());
      play("click", true);
      haptic([30, 10, 20]);
    }
  }), [now]);

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

  const changeSelectedDayBy = useCallback((delta: number) => {
    if (!selectedDay) return;
    const d = new Date(selectedDay.date);
    d.setDate(d.getDate() + delta);

    const y = d.getFullYear();
    if (y < LOWER_YEAR || y > UPPER_YEAR) {
      play("error", false);
      return;
    }

    const newKey = dateKeyFromDate(d);
    setSelectedDay({ key: newKey, date: d });
    play("click", false);
    haptic(20);
  }, [selectedDay, LOWER_YEAR, UPPER_YEAR]);

// while the details popup is open: left/right should move within popup
useEffect(() => {
  if (!selectedDay) return;

  function onPopupKey(e: KeyboardEvent) {
    const k = e.key.toLowerCase();
    if (k === "arrowleft") {
      e.preventDefault();
      e.stopPropagation();
      changeSelectedDayBy(-1);
    } else if (k === "arrowright") {
      e.preventDefault();
      e.stopPropagation();
      changeSelectedDayBy(1);
    }
  }

  window.addEventListener("keydown", onPopupKey);
  return () => window.removeEventListener("keydown", onPopupKey);
}, [selectedDay, changeSelectedDayBy]);

useEffect(() => {
  if (!selectedDay) return;

  function onEscape(e: KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopPropagation();
      play("click", false);
      setSelectedDay(null);
    }
  }

  window.addEventListener("keydown", onEscape);
  return () => window.removeEventListener("keydown", onEscape);
}, [selectedDay]);

  const openDay = (key: string, date: Date) => {
    play("click", false);
    haptic(25);
    setSelectedDay({ key, date });
  };

  const closeDay = () => {
    play("click", false);
    setSelectedDay(null);
  };

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement | null>(null);
  const headerYearRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    function onDocMouse(e: MouseEvent) {
        if (!pickerOpen) return;
        const tgt = e.target as Node | null;
        if (!tgt) return;
        if (pickerRef.current && pickerRef.current.contains(tgt)) return;
        if (headerYearRef.current && headerYearRef.current.contains(tgt)) return;
        play("click", false);
        setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDocMouse);
    return () => document.removeEventListener("mousedown", onDocMouse);
  }, [pickerOpen]);

  const yearOptions = useMemo(() => {
    const out: number[] = [];
    const start = Math.max(LOWER_YEAR, currentYear - 10);
    const end = Math.min(UPPER_YEAR, currentYear + 10);
    for (let y = start; y <= end; y++) out.push(y);
    return out;
  }, [currentYear]);

  function commitYearFromInput() {
    const parsed = Number(yearInput.trim());
    if (!Number.isFinite(parsed) || Number.isNaN(parsed)) {
      setYearInput(String(currentYear));
      return;
    }
    const clamped = Math.max(LOWER_YEAR, Math.min(UPPER_YEAR, Math.floor(parsed)));
    setCurrentYear(clamped);
    play("click", false);
    haptic(30);
    setPickerOpen(false);
  }

  function chooseYear(y: number) {
    const clamped = Math.max(LOWER_YEAR, Math.min(UPPER_YEAR, Math.floor(y)));
    setCurrentYear(clamped);
    play("click", false);
    haptic(30);
    setPickerOpen(false);
  }

  return (
    <div className="annual-calendar">
      <div className="annual-header" style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "center", flex: 1 }}>
          <h2 style={{ margin: 0, display: "flex", alignItems: "center", gap: 8 }}>
            Year:
            <button
              ref={headerYearRef}
              type="button"
              className="year-picker-toggle"
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              onClick={() => {
                setPickerOpen(v => {
                  play("click", false);
                  if (!v) haptic(20);
                  return !v;
                });
              }}
              title="Select year"
            >
              {currentYear} ▾
            </button>
          </h2>

          <div style={{ color: "var(--app-muted)", fontSize: 13 }}>Click on a day to view tasks</div>
        </div>

        {/* Prev / Next arrows on the right */}
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <button className="year-arrow" title="Previous year" aria-label="Previous year" onClick={() => chooseYear(currentYear - 1)}>◀</button>

          {/* Show “Today” (go current-year) only when NOT in current year */}
          {currentYear !== now.getFullYear() && (
            <button
              className="year-arrow"
              title="Jump to current year"
              aria-label="Jump to current year"
              onClick={() => {
                setCurrentYear(now.getFullYear());
                play("click", true);
                haptic([30, 10, 20]);
              }}
              style={{ fontWeight: 700 }}
            >
              Current year
            </button>
          )}

          <button className="year-arrow" title="Next year" aria-label="Next year" onClick={() => chooseYear(currentYear + 1)}>▶</button>
        </div>

        {/* picker dropdown */}
        {pickerOpen && (
          <div ref={pickerRef} className="year-picker" role="dialog" aria-label="Year picker">
            <div style={{ display: "flex", gap: 8, padding: "8px 10px", alignItems: "center" }}>
              <button type="button" className="btn-plain" onClick={() => chooseYear(currentYear - 1)}>◀</button>

              <input
                type="text"
                inputMode="numeric"
                className="year-picker-input"
                value={yearInput}
                onChange={(e) => {
                  const v = e.target.value;
                  if (/^[\d\s-]*$/.test(v)) {
                    setYearInput(v);
                  }
                }}
                onBlur={() => {
                  commitYearFromInput();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    commitYearFromInput();
                  } else if (e.key === "Escape") {
                    play("click", false);
                    setPickerOpen(false);
                    setYearInput(String(currentYear));
                  }
                }}
                aria-label="Year"
              />

              <button type="button" className="btn-plain" onClick={() => chooseYear(currentYear)}>Go</button>

              <button type="button" className="btn-plain" onClick={() => chooseYear(now.getFullYear())}>Today</button>
            </div>

            <div className="year-options">
              {yearOptions.map(y => (
                <button
                  key={y}
                  type="button"
                  className={`year-option ${y === currentYear ? "active" : ""}`}
                  onClick={() => chooseYear(y)}
                >
                  {y}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="months-grid">
        {Array.from({ length: 12 }).map((_, m0) => {
          const days = daysInMonth(currentYear, m0);
          const firstWeekday = new Date(currentYear, m0, 1).getDay(); // 0 Sun .. 6 Sat
          const cells: (null | number)[] = Array.from({ length: firstWeekday }).map(() => null);
          for (let d = 1; d <= days; d++) cells.push(d);

          return (
            <div key={m0} className="month-card bg-app-card" style={{ padding: 10 }}>
              <div className="month-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ fontWeight: 700, fontSize: 13 }}>
                  {new Date(currentYear, m0, 1).toLocaleString(undefined, { month: "short", year: "numeric" })}
                </div>
                <div style={{ color: "var(--app-muted)", fontSize: 12 }}>{days}d</div>
              </div>

              <div 
                className="weekday-labels" 
                style={{ 
                  display: "grid", 
                  gridTemplateColumns: "repeat(7, 1fr)", 
                  gap: 4, 
                  marginTop: 8, 
                  fontSize: 11, 
                  color: "var(--app-muted)"
                }}
              >
                {["S","M","T","W","T","F","S"].map((w, i) => (
                  <div key={`${w}-${i}`} style={{ textAlign: "center" }}>
                    {w}
                  </div>
                ))}
              </div>

              <div className="days-grid" style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 6, marginTop: 8 }}>
                {cells.map((v, idx) => {
                  if (v === null) return <div key={idx} className="day-cell empty" />;
                  const key = dateKeyFromYMD(currentYear, m0, v);
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
                      onClick={() => openDay(key, new Date(currentYear, m0, v))}
                      aria-pressed={selectedDay?.key === key}
                    >
                      <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                        <div className="day-number" style={{ fontSize: 12 }}>{v}</div>
                        {indicators.length > 0 && (
                          <div className="day-dots" aria-hidden style={{ display: "flex", gap: 4, marginTop: 6 }}>
                            {indicators.map((p, i) => (
                              <span
                                key={`${key}-dot-${i}`}
                                className={`dot prio-${p}`}
                                aria-hidden
                                title={p}
                                style={{ width: 8, height: 8, borderRadius: 999, display: "inline-block" }}
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
          <div className="calendar-day-popup" onClick={closeDay}>
            <div
              className="calendar-day-panel"
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  marginBottom: 10
                }}
              >
                <div style={{ fontWeight: 700}}>
                  {selectedDay.date.toLocaleDateString()}
                </div>
                <button
                  className="btn-plain"
                  onClick={() => {
                    play("click", false);
                    closeDay();
                  }}
                >
                  Close
                </button>
              </div>

              {(byDate.get(selectedDay.key) ?? []).length === 0 ? (
                <div style={{ color: "var(--app-muted)" }}>No tasks for this day</div>
              ) : (
                (byDate.get(selectedDay.key) ?? []).map(t => {
                  const progress = getSubtaskProgress(t);

                  return (
                    <div
                      key={t.id}
                      className={`snooze-card ${t.done ? "task-completed" : ""}`}
                      onClick={() => {
                        play("click", false);
                        haptic(25);
                        onOpenTask?.(t.id);
                        closeDay();
                      }}
                    >
                      {/* Title */}
                      <div
                        className={
                          t.done
                            ? "prio-completed"
                            : `prio-${t.priority}`
                        }
                        style={{ fontWeight: 700 }}
                      >
                      {t.text}
                    </div>

                    {/* Tags and deadline */}
                    <div
                      style={{
                        fontSize: 12,
                        color: "var(--app-muted)",
                        marginTop: 4
                      }}
                    >
                      {t.tags?.length ? t.tags.join(", ") : "No tags"}
                      {" · "}
                      {t.due
                        ? formatLocalDateTime(t.due)
                        : new Date(t.createdAt).toLocaleString()}
                      </div>

                    {/* Subtask progress */}
                    {progress && (
                      <div style={{ marginTop: 10 }}>
                        <div
                          className={`subtasks-progress ${t.done ? "todo-done" : ""}`}
                          role="progressbar"
                          aria-valuenow={progress.pct}
                          style={{ height: 6 }}
                        >
                          <div
                            className="subtasks-progress-fill"
                            style={{ width: `${progress.pct}%` }}
                          />
                        </div>

                        <div style={{ fontSize: 12, color: "var(--app-muted)", marginTop: 4 }}>
                          {progress.doneCount}/{progress.total} · {progress.pct}%
                        </div>

                        {/* Subtasks list */}
                        <div style={{ marginTop: 6, display: "flex", flexDirection: "column", gap: 4 }}>
                          {t.subtasks!.map(s => (
                            <div
                              key={s.id}
                              className={
                                s.done || t.done
                                  ? "subtask-done"
                                  : `prio-${s.priority}`
                              }
                              style={{ fontSize: 13 }}
                            >
                              • {s.text}
                              {s.due && (
                                <span
                                  style={{
                                    marginLeft: 6,
                                    color: "var(--app-muted)",
                                    fontSize: 11
                                  }}
                                >
                                  · {formatLocalDateTime(s.due)}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}
      </div>
    );
  }
);

export default AnnualCalendar;
