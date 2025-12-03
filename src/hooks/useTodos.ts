import { useEffect, useReducer, useRef, useState } from "react";
import type { Todo, Recurrence } from "../types";
import { parseLocalDateTime } from "../utils/dates";
import { play } from "../utils/sound";

const LOCAL_KEY = "todoapp:v1";

type State = { todos: Todo[] };
type Action =
  | { type: "INIT"; todos: Todo[] }
  | { type: "ADD"; todo: Todo }
  | { type: "TOGGLE"; id: string }
  | { type: "REMOVE"; id: string }
  | { type: "UPDATE"; id: string; patch: Partial<Todo> }
  | { type: "CLEAR_COMPLETED" }
  | { type: "SET_ALL"; done: boolean };

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "INIT":
      return { todos: action.todos };
    case "ADD":
      return { todos: [action.todo, ...state.todos] };
    case "TOGGLE":
      return { todos: state.todos.map(t => (t.id === action.id ? { ...t, done: !t.done } : t)) };
    case "REMOVE":
      return { todos: state.todos.filter(t => t.id !== action.id) };
    case "UPDATE":
      return { todos: state.todos.map(t => (t.id === action.id ? { ...t, ...action.patch } : t)) };
    case "CLEAR_COMPLETED":
      return { todos: state.todos.filter(t => !t.done) };
    case "SET_ALL":
      return { todos: state.todos.map(t => ({ ...t, done: action.done })) };
    default:
      return state;
  }
}

/** compute next due datetime-local string for a todo with recurrence */
function computeNextDue(todo: Todo): string | null {
  const rec: Recurrence | undefined = todo.recurrence as Recurrence | undefined;
  if (!rec) return null;

  const base = todo.due ? parseLocalDateTime(todo.due) : new Date(todo.createdAt);
  if (!base) return null;
  const next = new Date(base.getTime());

  if (rec.freq === "daily") {
    const interval = rec.interval ?? 1;
    next.setDate(next.getDate() + Math.max(1, Number(interval)));
  } else if (rec.freq === "weekly") {
    const interval = rec.interval ?? 1;
    const weekdays = rec.weekdays as number[] | undefined;
    if (Array.isArray(weekdays) && weekdays.length > 0) {
      for (let i = 1; i <= 14; i++) {
        const cand = new Date(base.getTime());
        cand.setDate(base.getDate() + i);
        if (weekdays.includes(cand.getDay())) {
          next.setTime(cand.getTime());
          break;
        }
      }
    } else {
      next.setDate(next.getDate() + interval * 7);
    }
  } else if (rec.freq === "monthly") {
    const interval = rec.interval ?? 1;
    const dom = rec.dayOfMonth ?? base.getDate();
    next.setMonth(next.getMonth() + Math.max(1, Number(interval)));
    next.setDate(dom);
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = next.getFullYear();
  const mm = pad(next.getMonth() + 1);
  const dd = pad(next.getDate());
  const hh = pad(next.getHours());
  const min = pad(next.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${min}`;
}

type AddPayload = {
  text: string;
  tags?: string[];
  due?: string | null;
  priority?: Todo["priority"];
  recurrence?: Recurrence | null;
  reminders?: number[];
};

export function useTodos() {
  const [state, dispatch] = useReducer(reducer, { todos: [] as Todo[] });
  const [autoCreateNext, setAutoCreateNext] = useState<boolean>(true);

  // undo/redo history
  const pastRef = useRef<Todo[][]>([]); // undo history (older snapshots)
  const futureRef = useRef<Todo[][]>([]); // redo history (snapshots undone)
  const HISTORY_MAX = 50;

  const [undoCount, setUndoCount] = useState<number>(0);
  const [redoCount, setRedoCount] = useState<number>(0);

  // undo: restore last snapshot from past -> move current to future
  const undo = () => {
    const past = pastRef.current;
    if (past.length === 0) return;
    const prev = past.pop()!;
    // push current state to future so redo is possible
    futureRef.current.push(state.todos.map(t => ({ ...t, tags: t.tags ? t.tags.slice() : [] })));
    // cap future
    if (futureRef.current.length > HISTORY_MAX) futureRef.current.shift();
    setUndoCount(past.length);
    setRedoCount(futureRef.current.length);
    dispatch({ type: "INIT", todos: prev });
    play("undo", true);
  };

  // redo: restore last snapshot from future -> push current to past
  const redo = () => {
    const fut = futureRef.current;
    if (fut.length === 0) return;
    const next = fut.pop()!;
    pastRef.current.push(state.todos.map(t => ({ ...t, tags: t.tags ? t.tags.slice() : [] })));
    if (pastRef.current.length > HISTORY_MAX) pastRef.current.shift();
    setUndoCount(pastRef.current.length);
    setRedoCount(fut.length);
    dispatch({ type: "INIT", todos: next });
    play("redo", true);
  };

  // load from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Todo[];
        dispatch({ type: "INIT", todos: parsed });
        return;
      }
    } catch (e) {
      console.warn("Oops! Failed to load todos from localStorage:", e);
    }

    dispatch({
      type: "INIT",
      todos: [
        {
          id: uid(),
          text: "Welcome! To get started with your todo app, just add stuff! :)",
          done: false,
          createdAt: Date.now(),
          due: null,
          tags: ["welcome"],
          priority: "medium",
        },
      ],
    });
  }, []);

  // persist on change
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(state.todos));
    } catch (e) {
      console.warn("Oh no! Failed to save todos:", e);
    }
  }, [state.todos]);

  // helper: push snapshot of current todos to past (and clear future)
  const pushHistory = () => {
    const snapshot = state.todos.map(t => ({ ...t, tags: t.tags ? t.tags.slice() : [] }));
    pastRef.current.push(snapshot);
    if (pastRef.current.length > HISTORY_MAX) pastRef.current.shift();
    // performing a new action invalidates redo stack
    futureRef.current.length = 0;
    setUndoCount(pastRef.current.length);
    setRedoCount(0);
  };

  // action wrappers that record history before mutating
  const add = (payload: AddPayload) => {
    const text = (payload?.text ?? "").toString().trim();
    if (!text) return;

    pushHistory();

    const tags = Array.isArray(payload.tags)
      ? payload.tags.map(t => t?.toString().trim()).filter(Boolean)
      : [];

    const due = payload.due == null ? null : String(payload.due);
    const validPriorities = ["high", "medium", "low"] as const;
    const priority = validPriorities.includes(payload.priority as Todo["priority"])
      ? (payload.priority as Todo["priority"])
      : "medium";

    const reminders = Array.isArray(payload.reminders)
      ? payload.reminders.map(n => Math.max(0, Number(n) || 0)).filter(n => Number.isFinite(n))
      : [];

    const todo: Todo = {
      id: uid(),
      text,
      done: false,
      createdAt: Date.now(),
      due,
      tags,
      priority,
      recurrence: payload.recurrence ?? null,
      reminders: reminders.length ? reminders : undefined,
    };

    dispatch({ type: "ADD", todo });
  };

  const toggle = (id: string, createNext?: boolean | null) => {
    const t = state.todos.find(x => x.id === id);
    if (!t) return;
    pushHistory();
    dispatch({ type: "TOGGLE", id });

    const willCreate = createNext === undefined || createNext === null ? autoCreateNext : createNext;
    if (!t.done && t.recurrence && willCreate) {
      const nextDue = computeNextDue(t);
      if (nextDue) {
        const cloneSubtasks = (t.subtasks ?? []).map(s => ({
          ...s,
          id: uid(),
          done: false,
          createdAt: Date.now(),
        }));
        const newTodo: Todo = {
          id: uid(),
          text: t.text,
          done: false,
          createdAt: Date.now(),
          due: nextDue,
          tags: t.tags.slice(),
          priority: t.priority,
          recurrence: t.recurrence ? { ...t.recurrence } : null,
          reminders: t.reminders ? t.reminders.slice() : undefined,
          subtasks: cloneSubtasks.length ? cloneSubtasks : undefined,
          notes: t.notes,
        };
        dispatch({ type: "ADD", todo: newTodo });
      }
    }
  };

  const remove = (id: string) => {
    const exists = state.todos.some(t => t.id === id);
    if (!exists) return;
    pushHistory();
    dispatch({ type: "REMOVE", id });
  };

  const update = (id: string, patch: Partial<Todo>) => {
    const exists = state.todos.some(t => t.id === id);
    if (!exists) return;
    pushHistory();
    dispatch({ type: "UPDATE", id, patch });
  };

  const clearCompleted = () => {
    if (!state.todos.some(t => t.done)) return;
    pushHistory();
    dispatch({ type: "CLEAR_COMPLETED" });
  };

  const setAll = (done: boolean) => {
    pushHistory();
    dispatch({ type: "SET_ALL", done });
  };

  const setTodos = (newTodos: Todo[]) => {
    pushHistory();
    dispatch({ type: "INIT", todos: newTodos });
  }

  return {
    todos: state.todos,
    add,
    toggle,
    remove,
    update,
    clearCompleted,
    setAll,
    setTodos,
    autoCreateNext,
    setAutoCreateNext,
    undo,
    redo,
    canUndo: undoCount > 0,
    canRedo: redoCount > 0,
  } as const;
}
