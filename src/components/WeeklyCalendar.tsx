import { useEffect, useMemo, useRef, useState } from "react";
import { play, haptic } from "../utils/sound";

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

function isSameWeek(a: Date, b: Date) {
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

type Props = {
  referenceDate?: Date;
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

  // auto-scroll so "now" is visible
  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = Math.max(0, nowY - 200);
  }, [nowY]);

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

  return (
    <div className="weekly-calendar" style={{ display: "flex", flexDirection: "column", height: "70vh" }}>

      {/* Navigation bar */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 8px",
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
            <div key={h}>
              {/* Hour label row */}
              <div
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
            <div style={{ height: HOUR_HEIGHT / 2 }} />
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
                  background: "var(--now-line)"
                }}
              />
            </div>
          )}
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
