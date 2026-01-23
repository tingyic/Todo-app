import { useCallback, useEffect, useRef, useState } from "react";
import { play } from "../utils/sound";
import TimetableEditor from "../components/TimetableEditor";
import type { TimetableTask } from "../components/TimetableEditor";

const TIMETABLE_STORAGE_KEY = "timetable:v1";

function loadFromStorage(): TimetableTask[] {
  try {
    const raw = localStorage.getItem(TIMETABLE_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TimetableTask[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(p => typeof p.id === "string");
  } catch {
    return [];
  }
}
function saveToStorage(tasks: TimetableTask[]) {
  try {
    localStorage.setItem(TIMETABLE_STORAGE_KEY, JSON.stringify(tasks));
  } catch {
    // ignore
  }
}

function formatDateKey(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const parseTimeToMinutes = (TimetableEditor as unknown as { parseTimeToMinutes ?: (s: string) => number | null })
  .parseTimeToMinutes!;

export function occursOnDate(template: TimetableTask, date: Date): boolean {
  const dateKey = formatDateKey(date);

  if (template.oneOffDate) {
    return template.oneOffDate === dateKey;
  }

  if (template.dayIndex % 7 !== date.getDay()) return false;

  const r = template.recurrence;
  if (!r) return true; // no recurrence = repeat weekly forever

  if (r.startDate) {
    const startD = new Date(r.startDate + "T00:00:00");
    if (date < startD) return false;
  }

  if (r.endDate) {
    const endD = new Date(r.endDate + "T23:59:59");
    if (date > endD) return false;
  }

  if (r.count && r.startDate) {
    const startD = new Date(r.startDate + "T00:00:00");
    const diffDays = Math.floor((date.getTime() - startD.getTime()) / (24 * 60 * 60 * 1000));
    const weeksSince = Math.floor(diffDays / 7);
    if (weeksSince < 0) return false;
    if ((weeksSince % (r.interval ?? 1)) !== 0) return false;
    const occIndex = Math.floor(weeksSince / (r.interval ?? 1));
    return occIndex < (r.count ?? 0);
  }

  if (r.startDate) {
    const startD = new Date(r.startDate + "T00:00:00");
    const diffDays = Math.floor((date.getTime() - startD.getTime()) / (24 * 60 * 60 * 1000));
    const weeksSince = Math.floor(diffDays / 7);
    if (weeksSince < 0) return false;
    return (weeksSince % (r.interval ?? 1)) === 0;
  }

  return true;
}

export function generateInstancesForWeek(templates: TimetableTask[], weekStartDate: Date) {
  type Instance = {
    templateId: string;
    id: string;
    title: string;
    date: Date;
    dayIndex: number;
    start?: string;
    end?: string;
    priority?: TimetableTask["priority"];
    completed: boolean;
    template: TimetableTask;
    notes?: string;
  };

  const res: Instance[] = [];

  const weekStartTime = weekStartDate.getTime();
  const weekEndTime = addDays(weekStartDate, 6).getTime();

  for (const tpl of templates) {
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStartDate, i);
      if (!occursOnDate(tpl, d)) continue;
      const dateKey = formatDateKey(d);

      // check exception (deleted)
      const exc = (tpl.exceptions ?? []).find(x => x.date === dateKey);
      if (exc && exc.deleted) continue;

      const overr = exc?.override ?? {};
      const startStr = overr.start ?? tpl.start;
      const endStr = overr.end ?? tpl.end;

      const sMin = parseTimeToMinutes(startStr ?? "") ?? null;
      const eMin = parseTimeToMinutes(endStr ?? "") ?? null;

      if (sMin === null || eMin === null || eMin > sMin) {
        res.push({
          templateId: tpl.id,
          id: `${tpl.id}::${dateKey}`,
          title: overr.title ?? tpl.title,
          date: d,
          dayIndex: d.getDay(),
          start: startStr,
          end: endStr,
          priority: overr.priority ?? tpl.priority,
          completed: false,
          template: tpl,
          notes: overr.notes ?? tpl.notes,
        });
        continue;
      }

      res.push({
        templateId: tpl.id,
        id: `${tpl.id}::${dateKey}`,
        title: overr.title ?? tpl.title,
        date: d,
        dayIndex: d.getDay(),
        start: startStr,
        end: "24:00",
        priority: overr.priority ?? tpl.priority,
        completed: false,
        template: tpl,
        notes: overr.notes ?? tpl.notes,
      });

      if (eMin > 0) {
        const nextDate = addDays(d, 1);
        const nextDateKey = formatDateKey(nextDate);
        const nextMillis = nextDate.getTime();
        if (nextMillis >= weekStartTime && nextMillis <= weekEndTime) {
          res.push({
            templateId: tpl.id,
            id: `${tpl.id}::${nextDateKey}::split`,
            title: overr.title ?? tpl.title,
            date: nextDate,
            dayIndex: nextDate.getDay(),
            start: "00:00",
            end: endStr,
            priority: overr.priority ?? tpl.priority,
            completed: false,
            template: tpl,
            notes: overr.notes ?? tpl.notes,
          });
        }
      }
    }
  }

  // sort by date/time
  res.sort((a, b) => {
    const d = a.date.getTime() - b.date.getTime();
    if (d !== 0) return d;
    const aStart = parseTimeToMinutes(a.start ?? "") ?? (24 * 60 + 1);
    const bStart = parseTimeToMinutes(b.start ?? "") ?? (24 * 60 + 1);
    return aStart - bStart;
  });
  
  return res;
}

export function useTimetable(opts?: { historyMax?: number }) {
  const HISTORY_MAX = opts?.historyMax ?? 200;

  const [timetableTasks, setTimetableTasks] = useState<TimetableTask[]>(() => loadFromStorage());

  // history
  const pastRef = useRef<TimetableTask[][]>([]);
  const futureRef = useRef<TimetableTask[][]>([]);
  const isApplyingHistoryRef = useRef(false);

  useEffect(() => {
    saveToStorage(timetableTasks);
  }, [timetableTasks]);

  const commitChange = useCallback((next: TimetableTask[]) => {
    if (!isApplyingHistoryRef.current) {
      const snapshot = JSON.parse(JSON.stringify(timetableTasks)) as TimetableTask[];
      pastRef.current.push(snapshot);
      if (pastRef.current.length > HISTORY_MAX) pastRef.current.shift();
      futureRef.current = [];
    }
    setTimetableTasks(next);
  }, [timetableTasks, HISTORY_MAX]);

  const undo = useCallback(() => {
    if (pastRef.current.length === 0) return;
    isApplyingHistoryRef.current = true;
    const current = JSON.parse(JSON.stringify(timetableTasks)) as TimetableTask[];
    const prev = pastRef.current.pop() as TimetableTask[];
    futureRef.current.unshift(current);
    setTimetableTasks(prev);
    isApplyingHistoryRef.current = false;
    play("undo", true);
  }, [timetableTasks]);

  const redo = useCallback(() => {
    if (futureRef.current.length === 0) return;
    isApplyingHistoryRef.current = true;
    const current = JSON.parse(JSON.stringify(timetableTasks)) as TimetableTask[];
    const next = futureRef.current.shift() as TimetableTask[];
    pastRef.current.push(current);
    setTimetableTasks(next);
    isApplyingHistoryRef.current = false;
    play("redo", true);
  }, [timetableTasks]);

  const addTimetableTask = useCallback((task: Omit<TimetableTask, "id">) => {
    let taskToStore: Omit<TimetableTask, "id"> = task;
    if (!task.recurrence) {
      const dayIndex = task.dayIndex ?? 0;
      const oneDate = new Date();
      oneDate.setDate(oneDate.getDate() + ((dayIndex - oneDate.getDay()) || 0));
      const dateKey = formatDateKey(oneDate);
      taskToStore = { ...task, oneOffDate: dateKey };
    }
    const t: TimetableTask = { ...taskToStore, id: `tt-${Date.now()}-${Math.floor(Math.random() * 1000)}` };
    const next = [...timetableTasks, t];
    commitChange(next);
    play("click", false);
  }, [timetableTasks, commitChange]);

  const updateTimetableTask = useCallback((id: string, payload: Omit<TimetableTask, "id">) => {
    const next = timetableTasks.map(t => (t.id === id ? { ...t, ...payload } : t));
    commitChange(next);
    play("click", false);
  }, [timetableTasks, commitChange]);

  const applyInstanceEditOnly = useCallback((templateId: string, date: Date, override: Partial<Omit<TimetableTask, "id" | "exceptions" | "recurrence">>) => {
    const next = timetableTasks.map(t => {
      if (t.id !== templateId) return t;
      const dateKey = formatDateKey(date);
      const ex = [...(t.exceptions ?? [])];
      const idx = ex.findIndex(x => x.date === dateKey);
      const entry = { date: dateKey, override };
      if (idx === -1) ex.push(entry);
      else ex[idx] = { ...ex[idx], override: { ...ex[idx].override, ...override } };
      return { ...t, exceptions: ex };
    });
    commitChange(next);
    play("click", false);
  }, [timetableTasks, commitChange]);

  const applyInstanceDeleteOnly = useCallback((templateId: string, date: Date) => {
    const next = timetableTasks.map(t => {
      if (t.id !== templateId) return t;
      const dateKey = formatDateKey(date);
      const ex = [...(t.exceptions ?? [])];
      const idx = ex.findIndex(x => x.date === dateKey);
      if (idx === -1) ex.push({ date: dateKey, deleted: true });
      else ex[idx] = { ...ex[idx], deleted: true, override: ex[idx].override };
      return { ...t, exceptions: ex };
    });
    commitChange(next);
    play("delete", false);
  }, [timetableTasks, commitChange]);

  const deleteThisAndFuture = useCallback((templateId: string, date: Date) => {
    const endDate = formatDateKey(addDays(date, -1));
    const next = timetableTasks.map(t => {
      if (t.id !== templateId) return t;
      const newRec = {
        ...(t.recurrence ?? {}),
        freq: t.recurrence?.freq ?? "weekly",
        endDate,
      };
      return { ...t, recurrence: newRec };
    });
    commitChange(next);
    play("delete", false);
  }, [timetableTasks, commitChange]);

  return {
    timetableTasks,
    setTimetableTasks,
    addTimetableTask,
    updateTimetableTask,
    applyInstanceEditOnly,
    applyInstanceDeleteOnly,
    deleteThisAndFuture,
    undo,
    redo,
    canUndo: () => pastRef.current.length > 0,
    canRedo: () => futureRef.current.length > 0,
  } as const;
}

export default useTimetable;
