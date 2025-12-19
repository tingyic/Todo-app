import { useEffect, useMemo, useRef, useState } from "react";

const HOUR_HEIGHT = 120; // px per hour
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

type Props = {
  referenceDate?: Date;
};

export default function WeeklyCalendar({ referenceDate }: Props) {
  const [now, setNow] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement | null>(null);

  // tick every minute
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const weekStart = useMemo(
    () => startOfWeek(referenceDate ?? new Date()),
    [referenceDate]
  );

  const days = useMemo(
    () => Array.from({ length: 7 }).map((_, i) => addDays(weekStart, i)),
    [weekStart]
  );

  const todayIndex = days.findIndex(
    d => d.toDateString() === now.toDateString()
  );

  const nowY = timeToY(now);

  // auto-scroll so "now" is visible
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = Math.max(0, nowY - 200);
  }, [nowY]);

  return (
    <div className="weekly-calendar" style={{ display: "flex", flexDirection: "column", height: "70vh" }}>
      
      {/* Header row */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "60px repeat(7, 1fr)",
          borderBottom: "1px solid var(--app-border)",
          fontSize: 12,
          color: "var(--app-muted)",
        }}
      >
        <div />
        {days.map((d, i) => {
          const isToday = d.toDateString() === now.toDateString();
          return (
            <div
              key={i}
              style={{
                padding: "6px 4px",
                textAlign: "center",
                fontWeight: isToday ? 700 : 500,
                color: isToday ? "var(--accent)" : undefined,
              }}
            >
              {DAY_LABELS[i]}
              <div style={{ fontSize: 11 }}>
                {d.getDate()}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable body */}
      <div
        ref={scrollRef}
        style={{
          display: "grid",
          gridTemplateColumns: "60px 1fr",
          overflowY: "auto",
          position: "relative",
        }}
      >

        {/* Time gutter */}
        <div>
          {Array.from({ length: 24 }).map((_, h) => (
            <div
              key={h}
              style={{
                height: HOUR_HEIGHT / 2,
                fontSize: 11,
                color: "var(--app-muted)",
                paddingTop: 2,
                boxSizing: "border-box",
              }}
            >
              {String(h).padStart(2, "0")}:00
            </div>
          ))}
        </div>

        {/* Week grid */}
        <div
          className="week-grid"
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(7, 1fr)",
            position: "relative",
            height: 24 * HOUR_HEIGHT,
          }}
        >
          {days.map((_, i) => (
            <div
              key={i}
              style={{
                borderLeft: "1px solid var(--app-border)",
                position: "relative",
              }}
            />
          ))}

          {/* NOW line — only today */}
          {todayIndex !== -1 && (
            <div
              className="now-line"
              style={{
                position: "absolute",
                top: nowY,
                left: `${(100 / 7) * todayIndex}%`,
                width: `${100 / 7}%`,
                height: 2,
                zIndex: 10,
                pointerEvents: "none",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  left: -4,
                  top: -4,
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: "var(--now-line, #ef4444)"
                }}
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
