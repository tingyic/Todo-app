import { useEffect, useReducer, useState } from "react";
import type { Todo, Recurrence } from "../types";
import { parseLocalDateTime } from "../utils/dates";

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

  // base date-time (use due if present, else createdAt)
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
      // find the next selected weekday strictly after base (search up to 14 days)
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
    // set day;
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

  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(state.todos));
    } catch (e) {
      console.warn("Oh no! Failed to save todos:", e);
    }
  }, [state.todos]);

  const add = (payload: AddPayload) => {
    const text = (payload?.text ?? "").toString().trim();
    if (!text) return;

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


    console.log("[useTodos.add] created todo:", todo);

    dispatch({ type: "ADD", todo });
  };

  /**
   * toggle(id, createNext?)
   * - createNext === undefined || null  => use global autoCreateNext
   * - createNext === true  => force create next occurrence
   * - createNext === false => do NOT create next occurrence
   */
  const toggle = (id: string, createNext?: boolean | null) => {
    // find todo
    const t = state.todos.find(x => x.id === id);
    // toggle base behaviour
    dispatch({ type: "TOGGLE", id });

    if (!t) return;

    // if marking to done and recurrence exists and creation allowed -> create next
    const willCreate = createNext === undefined || createNext === null ? autoCreateNext : createNext;
    if (!t.done && t.recurrence && willCreate) {
      const nextDue = computeNextDue(t);
      if (nextDue) {
        const newTodo: Todo = {
          id: uid(),
          text: t.text,
          done: false,
          createdAt: Date.now(),
          due: nextDue,
          tags: t.tags.slice(),
          priority: t.priority,
          recurrence: t.recurrence ? { ...t.recurrence } : null,
        };
        dispatch({ type: "ADD", todo: newTodo });
      }
    }
  };

  const remove = (id: string) => dispatch({ type: "REMOVE", id });
  const update = (id: string, patch: Partial<Todo>) => dispatch({ type: "UPDATE", id, patch });
  const clearCompleted = () => dispatch({ type: "CLEAR_COMPLETED" });
  const setAll = (done: boolean) => dispatch({ type: "SET_ALL", done });

  return {
    todos: state.todos,
    add,
    toggle,
    remove,
    update,
    clearCompleted,
    setAll,
    autoCreateNext,
    setAutoCreateNext,
  } as const;
}
