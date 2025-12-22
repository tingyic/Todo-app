import { useEffect, useMemo, useRef, useState } from "react";
import { play, haptic } from "../utils/sound";

const HOUR_HEIGHT = 120; // px per hour
const ALL_DAY_TASK_HEIGHT = 24;
const ALL_DAY_TASK_GAP = 4;
const HEADER_HEIGHT = 48;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function startOfWeek(d: Date) {
  const date = new Date(d);
  const day = date.getDay(); // 0 Sun .. 6 Sat
  const diff = (day === 0 ? -7 : 0) - day; // Sunday start
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
};

type DeadlineTask = {
  id: string;
  title: string;
  date: Date;
  priority: "low" | "medium" | "high";
  completed: boolean;
};


export default function WeeklyCalendar({ referenceDate }: Props) {
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const [anchorDate, setAnchorDate] = useState<Date>(
    () => referenceDate ?? new Date()
  );

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

  const demoTasks = useMemo<DeadlineTask[]>(
    () => [
      {
        id: "1",
        title: "Finish homework",
        date: new Date(),
        priority: "high",
        completed: false,
      },
      {
        id: "2",
        title: "Buy groceries",
        date: new Date(),
        priority: "low",
        completed: false,
      },
      {
        id: "3",
        title:
          "This is a trivially long task, just to test truncation, hopefully it works and won't break the code, im writing this just to increase word count, haha",
        date: new Date(),
        priority: "medium",
        completed: false,
      },
    ],
    []
  );

  const tasksByDay = useMemo(() => {
    const map = new Map<string, DeadlineTask[]>();

    for (const d of days) {
      map.set(d.toDateString(), []);
    }

    for (const task of demoTasks) {
      const key = task.date.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(task);
    }

    return map;
  }, [days, demoTasks]);

const maxPinnedPerDay = useMemo(() => {
  let max = 0;
  for (const tasks of tasksByDay.values()) {
    max = Math.max(max, tasks.length);
  }
  return max;
}, [tasksByDay])

const allDayHeight = 
  maxPinnedPerDay === 0
    ? 0
    : maxPinnedPerDay * ALL_DAY_TASK_HEIGHT + (maxPinnedPerDay - 1) * ALL_DAY_TASK_GAP + 12;

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

  function getPriorityStyle(priority: DeadlineTask["priority"], completed: boolean): React.CSSProperties {
    if (completed) {
      return {
        background: "var(--prio-completed-bg)",
        color: "var(--prio-completed-text)",
        textDecoration: "line-through",
        opacity: 0.7,
      };
    }

    const map: Record<DeadlineTask['priority'], { bg: string; color: string }> = {
      high: { bg: "var(--prio-high-bg)", color: "var(--prio-high)" },
      medium: { bg: "var(--prio-medium-bg)", color: "var(--prio-medium)" },
      low: { bg: "var(--prio-low-bg)", color: "var(--prio-low)" },
    };

    return {
      background: map[priority].bg,
      color: map[priority].color,
    };
  }

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
              alignItems: "center",
              boxSizing: "border-box",
            }}
          >
            {days.map(d => {
              const tasks = tasksByDay.get(d.toDateString()) ?? [];
              return (
                <div key={d.toDateString()} style={{
                  padding: 6,
                  boxSizing: "border-box",
                  overflow: "hidden"
                }}>
                  {tasks.map(t => (
                    <div key={t.id} title={t.title} style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      borderRadius: 6,
                      padding: "4px 6px",
                      fontSize: 12,
                      boxSizing: "border-box",
                      ...getPriorityStyle(t.priority, t.completed)
                    }}>{t.title}</div>
                  ))}
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

            {/* NOW line inside timed area */}
            {todayIndex !== -1 && (
              <div style={{
                position: "absolute",
                top: nowY,
                left: `calc((100% / 7) * ${todayIndex})`,
                width: `calc(100% / 7)`,
                height: 2,
                zIndex: 40,
                pointerEvents: "none",
                background: "transparent"
              }}>
                <div style={{ position: "absolute", left: -4, top: -4, width: 8, height: 8, borderRadius: "50%", background: "var(--now-line)" }} />
                <div style={{ position: "absolute", left: 0, right: 0, top: 0, height: 2, background: "var(--now-line)" }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
