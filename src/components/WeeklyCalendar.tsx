import { useEffect, useMemo, useRef, useState } from "react";
import { play, haptic } from "../utils/sound";
import type { Todo } from "../types";
import { parseLocalDateTime } from "../utils/dates";

const HOUR_HEIGHT = 120; // px per hour
const ALL_DAY_TASK_HEIGHT = 24;
const ALL_DAY_TASK_GAP = 4;
const HEADER_HEIGHT = 48;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PINNED_PER_DAY = 5;

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diff = -day;
  date.setDate(date.getDate() + diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function timeToY(date: Date) {
  return (date.getHours() + date.getMinutes() / 60) * HOUR_HEIGHT;
}

function isSameWeek(a: Date, b: Date) {
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

type Props = {
  referenceDate?: Date;
  todos: Todo[];
};

type PinnedTask = {
  id: string;
  title: string;
  date: Date;
  priority: "low" | "medium" | "high";
  completed: boolean;
};

type TimetableTask = {
  id: string;
  title: string,
  dayIndex: number; // 0 = Sun ... 6 = Sat
  start: string;
  end: string;
  priority: "low" | "medium" | "high";
};

function parseTimeToMinutes(time: string): number | null {
  if (!time || typeof time !== "string") return null;
  const m = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;
  return hh * 60 + mm;
}

export default function WeeklyCalendar({ referenceDate, todos }: Props) {
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [anchorDate, setAnchorDate] = useState<Date>(
    () => referenceDate ?? new Date()
  );

  const [expandedDays, setExpandedDays] = useState<Set<string>>(() => new Set());

  function toggleDayExpanded(dayKey: string) {
    setExpandedDays(prev => {
      const next = new Set(prev);
      if (next.has(dayKey)) next.delete(dayKey);
      else next.add(dayKey);
      return next;
    });
  }

  const isCurrentWeek = isSameWeek(anchorDate, new Date());

  // tick every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const weekStart = useMemo(
    () => startOfWeek(anchorDate),
    [anchorDate]
  );

  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const todayIndex = days.findIndex(
    d => d.toDateString() === now.toDateString()
  );

  const nowY = timeToY(now);

  const nowLineRef = useRef<HTMLDivElement | null>(null);
  const nowTooltipRef = useRef<HTMLDivElement | null>(null);

  const [nowHovered, setNowHovered] = useState(false);
  const [nowPinned, setNowPinned] = useState(false);

  const [nowDetailed, setNowDetailed] = useState<Date>(() => new Date());

  const showNowTooltip = nowHovered || nowPinned;

  useEffect(() => {
    if (!showNowTooltip) return;
    setNowDetailed(new Date());
    const id = setInterval(() => setNowDetailed(new Date()), 1000);
    return () => clearInterval(id);
  }, [showNowTooltip]);

  useEffect(() => {
    function onDocDown(e: MouseEvent | TouchEvent) {
      if (!nowPinned) return;
      const target = (e as MouseEvent).target as Node | null;
      if (!target) return;
      if (nowLineRef.current?.contains(target) || nowTooltipRef.current?.contains(target)) return;
      setNowPinned(false);
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setNowPinned(false);
        setNowHovered(false);
      }
    }

    function onScroll() {
      setNowPinned(false);
      setNowHovered(false);
    }

    document.addEventListener("mousedown", onDocDown);
    document.addEventListener("touchstart", onDocDown);
    window.addEventListener("keydown", onKey);
    const scEl = scrollRef.current;
    scEl?.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      document.removeEventListener("mousedown", onDocDown);
      document.removeEventListener("touchstart", onDocDown);
      window.removeEventListener("keydown", onKey);
      scEl?.removeEventListener("scroll", onScroll);
    };
  }, [nowPinned, scrollRef]);

  const pinnedTasks = useMemo<PinnedTask[]>(() => {
    return todos
      .filter(t => !!t.due)
      .map(t => {
        const parsed = parseLocalDateTime(String(t.due));
        if (!parsed) return null;
        return {
          id: t.id,
          title: t.text,
          date: parsed,
          priority: (t.priority ?? "medium") as PinnedTask["priority"],
          completed: !!t.done,
        } as PinnedTask;
      })
      .filter((x): x is PinnedTask => x !== null)
      .filter(t => isSameWeek(t.date, anchorDate));
  }, [todos, anchorDate]);

  const tasksByDay = useMemo(() => {
    const map = new Map<string, PinnedTask[]>();

    for (const d of days) {
      map.set(d.toDateString(), []);
    }

    for (const task of pinnedTasks) {
      const key = task.date.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }

    for (const tasks of map.values()) {
      tasks.sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return a.date.getTime() - b.date.getTime();
      });
    }

    return map;
  }, [days, pinnedTasks]);

  const maxVisibleLines = useMemo(() => {
    let max = 0;
    for (const [dayKey, tasks] of tasksByDay.entries()) {
      const isExpanded = expandedDays.has(dayKey);
      const count = tasks.length;
      const hasMore = count > MAX_PINNED_PER_DAY;

      let visibleLines = 0;
      if (isExpanded) {
        visibleLines = count + (hasMore ? 1 : 0);
      } else {
        visibleLines = Math.min(count, MAX_PINNED_PER_DAY) + (hasMore ? 1 : 0);
      }

      max = Math.max(max, visibleLines);
    }

    return max;
  }, [tasksByDay, expandedDays]);

  const allDayHeight =
    maxVisibleLines === 0
      ? 0
      : maxVisibleLines * ALL_DAY_TASK_HEIGHT + (Math.max(0, maxVisibleLines - 1)) * ALL_DAY_TASK_GAP + 12;

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const target = allDayHeight + nowY - 200;
    el.scrollTop = Math.max(0, target);
  }, [allDayHeight, nowY]);

  function goPrevWeek() {
    setAnchorDate(d => addDays(d, -7));
    play("whoosh", false);
    haptic(10);
  }

  function goNextWeek() {
    setAnchorDate(d => addDays(d, 7));
    play("whoosh", false);
    haptic(10);
  }

  function goToday() {
    setAnchorDate(new Date());
    play("click", false);
    haptic(10);
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (document.querySelector(".month-picker-open")) return;

      if (e.key === "ArrowLeft") {
        e.preventDefault();
        goPrevWeek();
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        goNextWeek();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function getPriorityStyle(priority: PinnedTask["priority"], completed: boolean): React.CSSProperties {
    if (completed) {
      return {
        background: "var(--prio-completed-bg)",
        color: "var(--prio-completed-text)",
        textDecoration: "line-through",
        opacity: 0.7,
      };
    }

    const map: Record<PinnedTask['priority'], { bg: string; color: string }> = {
      high: { bg: "var(--prio-high-bg)", color: "var(--prio-high)" },
      medium: { bg: "var(--prio-medium-bg)", color: "var(--prio-medium)" },
      low: { bg: "var(--prio-low-bg)", color: "var(--prio-low)" },
    };

    return {
      background: map[priority].bg,
      color: map[priority].color,
    };
  }

  const timetableTasks = useMemo<TimetableTask[]>(
    () => [
      {
        id: "tt-1",
        title: "CS2040S Lecture",
        dayIndex: 1, // Mon
        start: "10:00",
        end: "12:00",
        priority: "high",
      },
      {
        id: "tt-2",
        title: "Group Meeting CS2103T",
        dayIndex: 1, // Mon
        start: "10:00",
        end: "11:45",
        priority: "medium",
      },
      {
        id: "tt-3",
        title: "CS1010 Tutorial TA",
        dayIndex: 5, // Fri
        start: "13:00",
        end: "14:15",
        priority: "low",
      },
    ],
    []
  );

  const timetableLayout = useMemo(() => {
    const map = new Map<string, { colIndex: number; colCount: number }>();

    for (let day = 0; day < 7; day++) {
      const events = timetableTasks.filter(e => e.dayIndex === day);
      if (events.length === 0) continue;

      const sorted = events
        .map(e => {
          const startMin = parseTimeToMinutes(e.start);
          const endMin = parseTimeToMinutes(e.end);
          return startMin === null || endMin === null
            ? null
            : { ...e, startMin, endMin };
        })
        .filter((x): x is (TimetableTask & { startMin: number; endMin: number }) => x !== null)
        .sort((a, b) => a.startMin - b.startMin);

      const colsEnd: number[] = [];
      const assignments: { id: string; col: number }[] = [];

      for (const tasks of sorted) {
        let placedCol = -1;
        for (let c = 0; c < colsEnd.length; c++) {
          if (tasks.startMin >= colsEnd[c]) {
            placedCol = c;
            break;
          }
        }
        if (placedCol === -1) {
          placedCol = colsEnd.length;
          colsEnd.push(tasks.endMin);
        } else {
          colsEnd[placedCol] = tasks.endMin;
        }
        assignments.push({ id: tasks.id, col: placedCol });
      }

      const finalColCount = Math.max(1, colsEnd.length);

      for (const a of assignments) {
        map.set(a.id, { colIndex: a.col, colCount: finalColCount });
      }
    }

    return map;
  }, [timetableTasks]);

  const timedHeight = 24 * HOUR_HEIGHT;
  const halfHour = HOUR_HEIGHT / 2;

  return (
    <div className="weekly-calendar" style={{ display: "flex", flexDirection: "column", height: "70vh" }}>

      {/* Navigation bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: 8,
          borderBottom: "1px solid var(--app-border)",
        }}
      >
        <button onClick={goPrevWeek}>◀</button>

        {!isCurrentWeek && (
          <button onClick={goToday}>Today</button>
        )}

        <button onClick={goNextWeek}>▶</button>

        {/* Month-Year dropdown */}
        <MonthPicker
          value={anchorDate}
          onChange={setAnchorDate}
        />
      </div>
      
      {/* scrollable area: single grid inside */}
      <div ref={scrollRef} style={{ overflowY: "auto", position: "relative", flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "60px repeat(7, 1fr)",
            gridTemplateRows: `${HEADER_HEIGHT}px ${allDayHeight}px ${timedHeight}px`,
            minWidth: 0,
            position: "relative",
            boxSizing: "border-box"
          }}
        >
          {days.map((_, i) => {
            if (i === 0) return null;
            return (
              <div
                key={`sep-${i}`}
                style={{
                  position: "absolute",
                  top: 0,
                  left: `calc(60px + ((100% - 60px) / 7) * ${i})`,
                  height: "100%",
                  borderLeft: "1px solid var(--app-border)",
                  pointerEvents: "none",
                  zIndex: 35,
                  boxSizing: "border-box",
                }}
              />
            );
          })}

          {/* hour labels */}
          <div style={{
            gridColumn: 1,
            gridRow: "1 / 4",
            borderRight: "1px solid var(--app-border)",
            background: "var(--app-bg)",
            boxSizing: "border-box"
          }}>
            <div style={{ height: HEADER_HEIGHT, boxSizing: "border-box" }} />
            <div style={{ height: allDayHeight, boxSizing: "border-box", borderBottom: "1px solid var(--app-border)" }} />
            <div>
              {Array.from({ length: 24 }).map((_, h) => (
                <div key={h}>
                  <div style={{ height: HOUR_HEIGHT / 2, fontSize: 11, color: "var(--app-muted)", paddingTop: 2, boxSizing: "border-box" }}>
                    {String(h).padStart(2, "0")}:00
                  </div>
                  <div style={{ height: HOUR_HEIGHT / 2 }} />
                </div>
              ))}
            </div>
          </div>

          {/* HEADER ROW */}
          <div
            style={{
              gridColumn: "2 / span 7",
              gridRow: 1,
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              position: "sticky",
              top: 0,
              zIndex: 30,
              background: "var(--app-bg)",
              borderBottom: "1px solid var(--app-border)",
              alignItems: "center",
              boxSizing: "border-box",
            }}
          >
            {days.map((d, i) => {
              const isToday = d.toDateString() === now.toDateString();
              return (
                <div key={i} style={{
                  textAlign: "center",
                  padding: "6px 4px",
                  fontWeight: isToday ? 700 : 500,
                  color: isToday ? "var(--accent)" : undefined,
                  boxSizing: "border-box"
                }}>
                  {DAY_LABELS[i]}
                  <div style={{ fontSize: 11 }}>{d.getDate()}</div>
                </div>
              );
            })}
          </div>

          {/* ALL-DAY ROW */}
          <div
            style={{
              gridColumn: "2 / span 7",
              gridRow: 2,
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              position: "sticky",
              top: HEADER_HEIGHT,
              zIndex: 25,
              background: "var(--app-bg)",
              borderBottom: "1px solid var(--app-border)",
              alignItems: "start",
              boxSizing: "border-box",
            }}
          >
            {days.map(d => {
              const dayKey = d.toDateString();
              const tasks = tasksByDay.get(dayKey) ?? [];
              const isExpanded = expandedDays.has(dayKey);

              const hasMore = tasks.length > MAX_PINNED_PER_DAY;
              const visibleTasks = isExpanded ? tasks : tasks.slice(0, MAX_PINNED_PER_DAY);

              return (
                <div key={dayKey} style={{
                  padding: 6,
                  boxSizing: "border-box",
                  overflow: "hidden",
                  minWidth: 0,
                  minHeight: 0,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "stretch",
                  justifyContent: "flex-start",
                }}>
                  {visibleTasks.map(t => (
                    <div key={t.id} title={t.title} style={{
                      display: "block",
                      width: "100%",
                      minWidth: 0,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      borderRadius: 6,
                      padding: "4px 6px",
                      fontSize: 12,
                      boxSizing: "border-box",
                      marginBottom: ALL_DAY_TASK_GAP,
                      height: ALL_DAY_TASK_HEIGHT,
                      lineHeight: `${ALL_DAY_TASK_HEIGHT - 4}px`,
                      ...getPriorityStyle(t.priority, t.completed)
                    }}>{t.title}</div>
                  ))}

                  {hasMore && (
                    <div style={{
                      height: ALL_DAY_TASK_HEIGHT,
                      display: "flex",
                      justifyContent: "flex-end",
                      alignItems: "center",
                      marginTop: 2,
                    }}>
                      <button
                        onClick={() => toggleDayExpanded(dayKey)}
                        style={{
                          fontSize: 11,
                          padding: "2px 6px",
                          borderRadius: 6,
                          opacity: 0.9,
                        }}
                      >
                        {isExpanded ? "Collapse" : `+${tasks.length - MAX_PINNED_PER_DAY} more`}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* TIMED AREA */}
          <div
            style={{
              gridColumn: "2 / span 7",
              gridRow: 3,
              position: "relative",
              height: "100%",
              boxSizing: "border-box",
              overflow: "visible",
              backgroundImage: `repeating-linear-gradient(to bottom, transparent 0px, transparent ${halfHour - 1}px, var(--app-border) ${halfHour - 1}px, var(--app-border) ${halfHour}px)`
            }}
          >
            <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", height: "100%" }}>
              {days.map((_, i) => (
                <div key={i} style={{
                  height: "100%",
                  boxSizing: "border-box",
                  borderLeft: i === 0 ? undefined : "1px solid transparent"
                }} />
              ))}
            </div>

            {/* Timetable tasks */}
            {timetableTasks.map(tasks => {
              const layout = timetableLayout.get(tasks.id) ?? { colIndex: 0, colCount: 1 };

              const startMin = parseTimeToMinutes(tasks.start);
              const endMin = parseTimeToMinutes(tasks.end);
              if (startMin === null || endMin === null) return null;

              const top = (startMin / 60) * HOUR_HEIGHT;
              const height = Math.max(8, ((endMin - startMin) / 60) * HOUR_HEIGHT);

              const dayWidth = 100 / 7;
              const colWidth = dayWidth / layout.colCount;
              const left = dayWidth * tasks.dayIndex + colWidth * layout.colIndex;

              const pStyle = getPriorityStyle(tasks.priority, false);
              const background = (pStyle.background as string) ?? "var(--prio-medium-bg)";
              const color = (pStyle.color as string) ?? "var(--prio-medium)";

              return (
                <div
                  key={tasks.id}
                  title={`${tasks.title} ${String(tasks.start)}-${String(tasks.end)}`}
                  style={{
                    position: "absolute",
                    top,
                    left: `${left}%`,
                    width: `${colWidth}%`,
                    height,
                    padding: 6,
                    boxSizing: "border-box",
                    borderRadius: 6,
                    overflow: "hidden",
                    fontSize: 12,
                    border: "1px solid var(--app-border)",
                    background,
                    color,
                    zIndex: 10,
                    display: "flex",
                    alignItems: "center",
                    whiteSpace: "wrap",
                    textOverflow: "ellipsis",
                  }}
                >
                  {tasks.title}
                </div>
              );
            })}

            {/* NOW line inside timed area */}
            {todayIndex !== -1 && (() => {
              const nowForPosition = showNowTooltip ? nowDetailed : now;
              const nowYUsed = timeToY(nowForPosition);

              const colLeft = `calc((100% / 7) * ${todayIndex})`;
              const tooltipLeftCalc = `calc((100% / 7) * ${todayIndex} + 8px)`;
              const tooltipTop = Math.max(8, nowYUsed - 34);

              return (
                <>
                  <div
                    ref={nowLineRef}
                    style={{
                      position: "absolute",
                      top: nowYUsed,
                      left: colLeft,
                      width: `calc(100% / 7)`,
                      height: 2,
                      zIndex: 40,
                      pointerEvents: "auto", // enable hover/click
                      background: "transparent",
                      display: "block",
                      boxSizing: "border-box",
                    }}
                    onMouseEnter={() => setNowHovered(true)}
                    onMouseLeave={() => setNowHovered(false)}
                    onClick={(e) => {
                      setNowPinned(p => !p);
                      e.stopPropagation();
                    }}
                    onTouchStart={(e) => {
                      setNowPinned(p => !p);
                      e.stopPropagation();
                    }}
                    role="button"
                    aria-label="Current time"
                  >
                    {/* dot */}
                    <div style={{ position: "absolute", left: -4, top: -4, width: 8, height: 8, borderRadius: "50%", background: "var(--now-line)" }} />
                    {/* line */}
                    <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: "var(--now-line)" }} />
                  </div>

                  {/* Tooltip (hovered/pinned) */}
                  {showNowTooltip && (
                    <div
                      ref={nowTooltipRef}
                      style={{
                        position: "absolute",
                        left: tooltipLeftCalc,
                        top: tooltipTop,
                        zIndex: 60, // above sticky headers
                        background: "var(--app-card)",
                        color: "var(--app-text)",
                        border: "1px solid var(--app-border)",
                        padding: "6px 8px",
                        borderRadius: 6,
                        boxShadow: "0 6px 18px rgba(0,0,0,0.35)",
                        fontSize: 12,
                        whiteSpace: "nowrap",
                        transform: "translateX(0)",
                        pointerEvents: "auto",
                      }}
                    >
                      {nowDetailed.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit"})}
                    </div>
                  )}
                </>
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}

/* MonthPicker unchanged */
function MonthPicker({
  value,
  onChange,
}: {
  value: Date;
  onChange: (d: Date) => void;
}) {
  const [open, setOpen] = useState(false);
  const [viewDate, setViewDate] = useState(
    () => new Date(value.getFullYear(), value.getMonth(), 1)
  );

  const popupRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setViewDate(new Date(value.getFullYear(), value.getMonth(), 1));
  }, [value]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();

  const firstDayOfMonth = new Date(year, month, 1);
  const startWeekday = firstDayOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  function prevMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    play("whoosh", false);
    haptic(10);
  }

  function nextMonth() {
    setViewDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    play("whoosh", false);
    haptic(10);
  }

  useEffect(() => {
    if (!open) return;

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        prevMonth();
      }

      if (e.key === "ArrowRight") {
        e.preventDefault();
        nextMonth();
      }

      if (e.key === "Escape") {
        e.preventDefault();
        setOpen(false);
        play("click", false);
        haptic(10);
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function onClickOutside(e: MouseEvent) {
      if (popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setOpen(false);
        play("click", false);
        haptic(10);
      }
    }

    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  return (
    <div style={{ position: "relative" }}>
      <button onClick={() => setOpen(o => !o)}>
        {value.toLocaleString("default", {
          month: "long",
          year: "numeric",
        })}
      </button>

      {open && (
        <div
          ref={popupRef}
          className="month-picker-open"
          style={{
            position: "absolute",
            top: "100%",
            right: 0,
            background: "var(--app-card)",
            border: "1px solid var(--app-border)",
            borderRadius: 10,
            padding: 8,
            zIndex: 50,
            width: 220,
          }}
        >
          {/* Month header */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6,
            }}
          >
            <button onClick={prevMonth}>◀</button>
            <strong style={{ fontSize: 13 }}>
              {viewDate.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <button onClick={nextMonth}>▶</button>
          </div>

          {/* Day labels */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              fontSize: 11,
              color: "var(--app-muted)",
              marginBottom: 4,
              textAlign: "center",
            }}
          >
            {["S", "M", "T", "W", "T", "F", "S"].map(d => (
              <div key={d}>{d}</div>
            ))}
          </div>

          {/* Day grid */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(7, 1fr)",
              gap: 4,
              fontSize: 12,
            }}
          >
            {Array.from({ length: startWeekday }).map((_, i) => (
              <div key={`pad-${i}`} />
            ))}

            {Array.from({ length: daysInMonth }).map((_, i) => {
              const d = new Date(year, month, i + 1);

              return (
                <button
                  key={i}
                  style={{
                    padding: "4px 0",
                    borderRadius: 6,
                    background: "transparent",
                  }}
                  onClick={() => {
                    onChange(d);
                    setOpen(false);
                    play("click", false);
                    haptic(10);
                  }}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>

          <button
            style={{
              marginTop: 8,
              width: "100%",
              fontSize: 12,
            }}
            onClick={() => {
              setOpen(false);
              play("click", false);
              haptic(10);
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
