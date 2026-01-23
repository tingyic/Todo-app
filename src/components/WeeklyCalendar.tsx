import React, { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { play, haptic } from "../utils/sound";
import type { Todo } from "../types";
import { parseLocalDateTime } from "../utils/dates";
import TimetableEditor, { type TimetableTask, type TimetableEditorWithHelpers } from "./TimetableEditor";
import TimetableItem from "./TimetableItem";
import useTimetable, { generateInstancesForWeek } from "../hooks/useTimetable";

const HOUR_HEIGHT = 120; // px per hour
const ALL_DAY_ITEM_HEIGHT = 24;
const ALL_DAY_ITEM_GAP = 4;
const HEADER_HEIGHT = 48;
const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MAX_PINNED_PER_DAY = 5;
const CREATE_LONG_PRESS_MS = 200;
const MOVE_THRESHOLD_PX = 8;

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

function formatDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function timeToY(date: Date) {
  return (date.getHours() + date.getMinutes() / 60) * HOUR_HEIGHT;
}

function yToMinutes(y: number) {
  const mins = (y / HOUR_HEIGHT) * 60;
  return Math.max(0, Math.min(24 * 60, mins));
}

function minutesToHHMM(mins: number) {
  const hh = Math.floor(mins / 60);
  const mm = Math.floor(mins % 60);
  const pad = (n : number) => String(n).padStart(2, "0");
  return `${pad(hh)}:${pad(mm)}`;
}

function isSameWeek(a: Date, b: Date) {
  return startOfWeek(a).getTime() === startOfWeek(b).getTime();
}

type Props = {
  referenceDate?: Date;
  todos: Todo[];
  onOpenTask?: (id: string) => void;
  showToast?: (msg: string, ms?: number) => void;
  onHistoryChange?: (state: { canUndo: boolean; canRedo: boolean }) => void;
  onTasksChange?: (tasks: TimetableTask[]) => void;
};

type PinnedItem = {
  id: string;
  title: string;
  date: Date;
  priority: "low" | "medium" | "high";
  completed: boolean;
};

type Instance = {
  templateId: string;
  id: string; // `${templateId}::YYYY-MM-DD`
  title: string;
  date: Date;
  dayIndex: number;
  start?: string;
  end?: string;
  priority?: "low" | "medium" | "high";
  completed: boolean;
  template: TimetableTask;
  notes?: string;
};

type WeeklyCalendarHandle = {
  undo: () => void;
  redo: () => void;
  canUndo: () => boolean;
  canRedo: () => boolean;
};

const parseTimeToMinutes = (TimetableEditor as TimetableEditorWithHelpers).parseTimeToMinutes!;

const WeeklyCalendar = forwardRef<WeeklyCalendarHandle | null, Props>(function WeeklyCalendar({ referenceDate, todos, onOpenTask, showToast, onHistoryChange, onTasksChange }, ref) {
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

  const createTimerRef = useRef<number | null>(null);
  const pointerStartRef = useRef<{ x: number; y: number; dayIndex: number; } | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createStartMin, setCreateStartMin] = useState<number | null>(null);
  const [createEndMin, setCreateEndMin] = useState<number | null>(null);
  const [createDayIndex, setCreateDayIndex] = useState<number | null>(null);

  function clearCreateTimer() {
    if (createTimerRef.current) {
      window.clearTimeout(createTimerRef.current);
      createTimerRef.current = null;
    }
  }

  function startCreateMode(startY: number, dayIndex: number, targetEl: Element, pointerId?: number) {
    const mins = yToMinutes(startY);
    const snapped = Math.floor(mins / 30) * 30;
    setCreateStartMin(snapped);
    setCreateEndMin(snapped + 30);
    setCreateDayIndex(dayIndex);
    setIsCreating(true);

    const capTarget = targetEl as unknown as { setPointerCapture?: (id: number) => void };
    try {
      if (capTarget.setPointerCapture && pointerId != null) {
        capTarget.setPointerCapture(pointerId);
      }
    } catch {
      // empty
    }
  }

  function finaliseCreate(e?: React.PointerEvent | null) {
    clearCreateTimer();
    const s = createStartMin;
    const t = createEndMin;
    const dIndex = createDayIndex;

    try {
      if (e) {
        const relTarget = e.target as unknown as { releasePointerCapture?: (id: number) => void };
        relTarget.releasePointerCapture?.(e.pointerId);
      }
    } catch {
      // empty
    }

    pointerStartRef.current = null;
    setIsCreating(false);

    if (s == null || t == null || dIndex == null) {
      setCreateStartMin(null);
      setCreateEndMin(null);
      setCreateDayIndex(null);
      return;
    }

    const prefill: Partial<TimetableTask> = {
      dayIndex: dIndex,
      start: minutesToHHMM(s),
      end: minutesToHHMM(t),
      priority: "medium",
      title: "",
    };

    setAddPrefill(prefill);
    setAddOpen(true);

    setCreateStartMin(null);
    setCreateEndMin(null);
    setCreateDayIndex(null);
  }

  function handleTimedPointerDown(e: React.PointerEvent) {
    if (e.button !== 0) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const relX = e.clientX - rect.left;
    const dayWidthPx = rect.width / 7;
    const dayIndex = Math.min(6, Math.max(0, Math.floor(relX / dayWidthPx)));

    pointerStartRef.current = { x: e.clientX, y: e.clientY, dayIndex };

    const isTouch = e.pointerType === "touch";

    if (isTouch) {
      createTimerRef.current = window.setTimeout(() => {
        startCreateMode(pointerStartRef.current!.y - rect.top, dayIndex, e.currentTarget as Element, e.pointerId);
        createTimerRef.current = null;
      }, CREATE_LONG_PRESS_MS);
    } else {
      startCreateMode(e.clientY - rect.top, dayIndex, e.currentTarget as Element, e.pointerId)
    }
  }

  function handleTimedPointerMove(e: React.PointerEvent) {
    const started = pointerStartRef.current;
    if (!started) return;

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const moveDy = Math.abs(e.clientY - started.y);

    if (!isCreating) {
      if (moveDy > MOVE_THRESHOLD_PX) {
        clearCreateTimer();
        pointerStartRef.current = null;
      }
      return;
    }

    e.preventDefault();

    const relY = e.clientY - rect.top;
    const startMin = createStartMin ?? 0;
    const currentMinRaw = yToMinutes(relY);
    const snappedEnd = Math.max(startMin + 30, Math.ceil(currentMinRaw / 30) * 30);
    setCreateEndMin(snappedEnd);
  }

  function handleTimedPointerUp(e: React.PointerEvent) {
    if (isCreating) {
      finaliseCreate(e);
    } else {
      clearCreateTimer();
      pointerStartRef.current = null;
    }
  }

  function handleTimedPointerCancel() {
    clearCreateTimer();
    pointerStartRef.current = null;
    if (isCreating) {
      setIsCreating(false);
      setCreateStartMin(null);
      setCreateEndMin(null);
    }
  }

  const pinnedItems = useMemo<PinnedItem[]>(() => {
    return todos
      .filter(t => !!t.due)
      .map(t => {
        const parsed = parseLocalDateTime(String(t.due));
        if (!parsed) return null;
        return {
          id: t.id,
          title: t.text,
          date: parsed,
          priority: (t.priority ?? "medium") as PinnedItem["priority"],
          completed: !!t.done,
        } as PinnedItem;
      })
      .filter((x): x is PinnedItem => x !== null)
      .filter(t => isSameWeek(t.date, anchorDate));
  }, [todos, anchorDate]);

  const itemsByDay = useMemo(() => {
    const map = new Map<string, PinnedItem[]>();

    for (const d of days) {
      map.set(d.toDateString(), []);
    }

    for (const item of pinnedItems) {
      const key = item.date.toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(item);
    }

    for (const items of map.values()) {
      items.sort((a, b) => {
        if (a.completed !== b.completed) {
          return a.completed ? 1 : -1;
        }
        return a.date.getTime() - b.date.getTime();
      });
    }

    return map;
  }, [days, pinnedItems]);

  const {
    timetableTasks,
    setTimetableTasks,
    addTimetableTask: addTimetableTaskHook,
    updateTimetableTask: updateTimetableTaskHook,
    applyInstanceEditOnly: applyInstanceEditOnlyHook,
    applyInstanceDeleteOnly: applyInstanceDeleteOnlyHook,
    deleteThisAndFuture: deleteThisAndFutureHook,
    undo: timetableUndoHook,
    redo: timetableRedoHook,
    canUndo: timetableCanUndoHook,
    canRedo: timetableCanRedoHook,
  } = useTimetable({ historyMax: 200 });

  useEffect(() => {
    onTasksChange?.(timetableTasks);
  }, [onTasksChange, timetableTasks])

  const lastHistoryRef = useRef({ canUndo: false, canRedo: false });
  useEffect(() => {
    if (!onHistoryChange) return;
    const next = { canUndo: timetableCanUndoHook(), canRedo: timetableCanRedoHook() };
    const prev = lastHistoryRef.current;
    if (prev.canUndo !== next.canUndo || prev.canRedo !== next.canRedo) {
      lastHistoryRef.current = next;
      onHistoryChange(next);
    }
  }, [timetableTasks, timetableCanUndoHook, timetableCanRedoHook, onHistoryChange]);

  useImperativeHandle(ref, () => ({
    undo: timetableUndoHook,
    redo: timetableRedoHook,
    canUndo: () => timetableCanUndoHook(),
    canRedo: () => timetableCanRedoHook(),
  }), [timetableUndoHook, timetableRedoHook, timetableCanUndoHook, timetableCanRedoHook]);
  
  const instances = useMemo(() => generateInstancesForWeek(timetableTasks, weekStart), [timetableTasks, weekStart]);
  
  function applyInstanceEditOnly(templateId: string, date: Date, override: Partial<Omit<TimetableTask, "id" | "exceptions" | "recurrence">>) {
    applyInstanceEditOnlyHook(templateId, date, override);
    showToast?.("This occurence updated", 900);
    play("click", false);
  }

  function applyInstanceDeleteOnly(templateId: string, date: Date) {
    applyInstanceDeleteOnlyHook(templateId, date);
    showToast?.("This occurence deleted", 900);
    play("delete", false);
  }  

  const maxVisibleLines = useMemo(() => {
    let max = 0;
    for (const [dayKey, tasks] of itemsByDay.entries()) {
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
  }, [itemsByDay, expandedDays]);

  const allDayHeight =
    maxVisibleLines === 0
      ? 0
      : maxVisibleLines * ALL_DAY_ITEM_HEIGHT + (Math.max(0, maxVisibleLines - 1)) * ALL_DAY_ITEM_GAP + 12;

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

  function addTimetableTask(task: Omit<TimetableTask, "id">) {
    addTimetableTaskHook(task);
    play("click", false);
    haptic(10);
    showToast?.("Timetable task added", 900);
  }

  function updateTimetableTask(id:string, payload: Omit<TimetableTask, "id">) {
    updateTimetableTaskHook(id, payload);
    play("click", false);
    haptic(10);
    showToast?.("Timetable task updated", 800);
  }

  const instanceLayout = useMemo(() => {
    const map = new Map<string, { colIndex: number; colCount: number }>();

    // group instances by dayIndex
    const byDay = new Map<number, (Instance & { startMin: number; endMin: number })[]>();
    for (const inst of instances) {
      const s = parseTimeToMinutes(inst.start ?? "");
      const e = parseTimeToMinutes(inst.end ?? "");
      if (s === null || e === null) continue;
      const arr = byDay.get(inst.dayIndex) ?? [];
      arr.push({ ...inst, startMin: s, endMin: e });
      byDay.set(inst.dayIndex, arr);
    }

    for (const [, arr] of byDay.entries()) {
      arr.sort((a, b) => a.startMin - b.startMin);

      const colsEnd: number[] = [];
      const assignments: { id: string; col: number }[] = [];

      for (const it of arr) {
        let placedCol = -1;
        for (let c = 0; c < colsEnd.length; c++) {
          if (it.startMin >= colsEnd[c]) {
            placedCol = c;
            break;
          }
        }
        if (placedCol === -1) {
          placedCol = colsEnd.length;
          colsEnd.push(it.endMin);
        } else {
          colsEnd[placedCol] = it.endMin;
        }
        assignments.push({ id: it.id, col: placedCol });
      }

      const finalColCount = Math.max(1, colsEnd.length);
      for (const a of assignments) {
        map.set(a.id, { colIndex: a.col, colCount: finalColCount });
      }
    }

    return map;
  }, [instances]);

  const timedHeight = 24 * HOUR_HEIGHT;
  const halfHour = HOUR_HEIGHT / 2;

  const [addOpen, setAddOpen] = useState(false);
  const [addPrefill, setAddPrefill] = useState<Partial<TimetableTask> | undefined>(undefined);
  
  const [editTimetableOpen, setEditTimetableOpen] = useState(false);
  const [editTimetableId, setEditTimetableId] = useState<string | null>(null);
  const [editTimetablePrefill, setEditTimetablePrefill] = useState<Partial<TimetableTask> | undefined>(undefined);

  const [editingInstanceDate, setEditingInstanceDate] = useState<Date | null>(null);

  function startEditTimetable(id: string, instanceDate?: Date | null) {
    const t = timetableTasks.find(x => x.id === id);
    if (!t) return;

    if (instanceDate) {
      const dateKey = formatDateKey(instanceDate);
      const exc = (t.exceptions ?? []).find(x => x.date === dateKey);
      const overr = exc?.override ?? {};
      setEditTimetablePrefill({ ...t, ...overr });
      setEditingInstanceDate(instanceDate);
    } else {
      setEditTimetablePrefill({ ...t });
      setEditingInstanceDate(null);
    }

    setEditTimetableId(id);
    setEditTimetableOpen(true);
  }

  function handleSaveEditTimetable(payload: Omit<TimetableTask, "id">) {
    if (!editTimetableId) return;

    if (editingInstanceDate) {
      const applyAll = window.confirm("Apply changes to all occurrences? (Cancel = only this occurrence)");
      if (applyAll) {
        updateTimetableTask(editTimetableId, payload);
      } else {
        const override: Partial<Omit<TimetableTask, "id" | "exceptions" | "recurrence">> = {
          title: payload.title,
          start: payload.start,
          end: payload.end,
          priority: payload.priority,
          tags: payload.tags,
          dayIndex: payload.dayIndex,
          notes: payload.notes,
          reminders: payload.reminders,
        };
        applyInstanceEditOnly(editTimetableId, editingInstanceDate, override);
      }
    } else {
      updateTimetableTask(editTimetableId, payload);
    }

    setEditTimetableOpen(false);
    setEditTimetableId(null);
    setEditTimetablePrefill(undefined);
    setEditingInstanceDate(null);
  }

  function deleteThisAndFuture(templateId: string, date: Date) {
    deleteThisAndFutureHook(templateId, date);
    play("delete", false);
    haptic(10);
    showToast?.("This and future occurrences deleted", 900);
  }

  function handleDeleteFromEditor() {
    if (!editTimetableId) {
      setEditTimetableOpen(false);
      return;
    }

    if (editingInstanceDate) {
      const choice = window.prompt("Delete: (1): only this, (2) this and future, (3) all occurences - Enter 1/2/3", "1");
      if (choice === "3") {
        // delete entire
        setTimetableTasks(prev => prev.filter(t => t.id !== editTimetableId));
      } else if (choice === "2") {
        // delete current and all future instances
        deleteThisAndFuture(editTimetableId, editingInstanceDate);
      } else {
        // only this instance
        applyInstanceDeleteOnly(editTimetableId, editingInstanceDate);
      }
      play("delete", false);
      showToast?.("Timetable removed", 900);
    }

    setEditTimetableOpen(false);
    setEditTimetableId(null);
    setEditTimetablePrefill(undefined);
    setEditingInstanceDate(null);
  }

  function handlePinnedClick(id: string) {
    if (onOpenTask) {
      play("click", false);
      haptic(10);
      onOpenTask(id);
    }
  }

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
        <button className="app-btn" onClick={goPrevWeek}>◀</button>

        {!isCurrentWeek && (
          <button className="app-btn" onClick={goToday}>Today</button>
        )}

        <button className="app-btn" onClick={goNextWeek}>▶</button>

        {/* Month-Year dropdown */}
        <MonthPicker
          value={anchorDate}
          onChange={setAnchorDate}
        />

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Add timetable task button */}
        <button
          className="app-btn"
          onClick={() => {
            setAddOpen(true);
            play("click", false);
            haptic(10);
          }}
          title="Add timetable task"
        >
          +
        </button>
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
              const items = itemsByDay.get(dayKey) ?? [];
              const isExpanded = expandedDays.has(dayKey);

              const hasMore = items.length > MAX_PINNED_PER_DAY;
              const visibleItems = isExpanded ? items : items.slice(0, MAX_PINNED_PER_DAY);

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
                  {visibleItems.map(i => (
                    <div key={i.id} title={i.title} onClick={(e) => { e.stopPropagation(); handlePinnedClick(i.id); }} role="button" style={{
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
                      marginBottom: ALL_DAY_ITEM_GAP,
                      height: ALL_DAY_ITEM_HEIGHT,
                      lineHeight: `${ALL_DAY_ITEM_HEIGHT - 4}px`,
                      cursor: "pointer",
                      ...(TimetableItem.getPriorityStyle?.(i.priority, i.completed) ?? {})
                    }}>{i.title}</div>
                  ))}

                  {hasMore && (
                    <div style={{
                      height: ALL_DAY_ITEM_HEIGHT,
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
                        {isExpanded ? "Collapse" : `+${items.length - MAX_PINNED_PER_DAY} more`}
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
            onPointerDown={handleTimedPointerDown}
            onPointerMove={handleTimedPointerMove}
            onPointerUp={handleTimedPointerUp}
            onPointerCancel={handleTimedPointerCancel}
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
            {instances.map(inst => {
              const layout = instanceLayout.get(inst.id) ?? { colIndex: 0, colCount: 1 };

              const startMin = parseTimeToMinutes(inst.start ?? "");
              const endMin = parseTimeToMinutes(inst.end ?? "");
              if (startMin === null || endMin === null) return null;

              return (
                <TimetableItem
                  key={inst.id}
                  id={inst.id}
                  templateId={inst.templateId}
                  title={inst.title}
                  startMin={startMin}
                  endMin={endMin}
                  dayIndex={inst.dayIndex}
                  colIndex={layout.colIndex}
                  colCount={layout.colCount}
                  notes={inst.notes}
                  priority={inst.priority ?? "medium"}
                  completed={inst.completed}
                  hourHeight={HOUR_HEIGHT}
                  onEdit={startEditTimetable}
                  date={inst.date}
                />
              );
            })}

            {/* Preview rectangle while drag/click creating */}
            {isCreating && createStartMin !== null && createEndMin !== null && createDayIndex !== null && (
              (() => {
                const top = (createStartMin / 60) * HOUR_HEIGHT;
                const height = Math.max(8, ((createEndMin - createStartMin) / 60) * HOUR_HEIGHT);
                const dayWidthPerc = 100 / 7;
                const leftPerc = dayWidthPerc * createDayIndex;
                return (
                  <div
                    aria-hidden
                    style={{
                      position: "absolute",
                      top,
                      left: `${leftPerc}%`,
                      width: `${dayWidthPerc}%`,
                      height,
                      padding: 6,
                      boxSizing: "border-box",
                      borderRadius: 6,
                      background: "rgba(0, 120, 255, 0.12)",
                      border: "1px dashed rgba(0, 120, 255, 0.5)",
                      zIndex: 50,
                      pointerEvents: "none",
                    }}
                  />
                );
              })()
            )}

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
                        boxShadow: "0 6px 18px rgba(0, 0, 0, 0.35)",
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

      {/* Timetable editor (add) */}
      <TimetableEditor
        open={addOpen}
        initialDay={addPrefill?.dayIndex ?? new Date().getDay()}
        prefill={addPrefill}
        onClose={() => { setAddOpen(false); setAddPrefill(undefined); }}
        onSave={payload => {
          addTimetableTask(payload);
          setAddPrefill(undefined);
          setAddOpen(false);
        }}
      />

      {/* Timetable editor (edit) */}
      <TimetableEditor
        open={editTimetableOpen}
        initialDay={editTimetablePrefill?.dayIndex ?? new Date().getDay()}
        prefill={editTimetablePrefill}
        onClose={() => {
          setEditTimetableOpen(false);
          setEditTimetableId(null);
          setEditTimetablePrefill(undefined);
        }}
        onSave={payload => handleSaveEditTimetable(payload)}
        onDelete={handleDeleteFromEditor}
      />
    </div>
  );
});

export default WeeklyCalendar;

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
            <button className="app-btn" onClick={prevMonth}>◀</button>
            <strong style={{ fontSize: 13 }}>
              {viewDate.toLocaleString("default", {
                month: "long",
                year: "numeric",
              })}
            </strong>
            <button className="app-btn" onClick={nextMonth}>▶</button>
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
                  className="app-btn"
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
            className="app-btn"
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
