import { useEffect, useReducer } from "react";
import type { Todo } from "../types";

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

/**
 * add expects a payload object:
 * { text: string, tags?: string[], due?: string | null, priority?: "high"|"medium"|"low" }
 */
type AddPayload = {
  text: string;
  tags?: string[];
  due?: string | null;
  priority?: Todo["priority"];
};

export function useTodos() {
  const [state, dispatch] = useReducer(reducer, { todos: [] as Todo[] });

  useEffect(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Todo[];
        dispatch({ type: "INIT", todos: parsed });
        return;
      }
    } catch (e) {
      // keep app resilient if localStorage contains invalid JSON
      // eslint-disable-next-line no-console
      console.warn("Failed to load todos from localStorage:", e);
    }

    // initial sample if none
    dispatch({
      type: "INIT",
      todos: [
        {
          id: uid(),
          text: "Welcome — add your first todo",
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
      // eslint-disable-next-line no-console
      console.warn("Failed to save todos:", e);
    }
  }, [state.todos]);

  const add = (payload: AddPayload) => {
    // defensive validation
    const text = (payload?.text ?? "").toString().trim();
    if (!text) return;

    const tags = Array.isArray(payload.tags)
      ? payload.tags.map(t => t?.toString().trim()).filter(Boolean)
      : [];

    const due = payload.due == null ? null : String(payload.due);

    const validPriorities = ["high", "medium", "low"] as const;
    const priority = validPriorities.includes(payload.priority as any)
      ? (payload.priority as Todo["priority"])
      : "medium";

    const todo: Todo = {
      id: uid(),
      text,
      done: false,
      createdAt: Date.now(),
      due,
      tags,
      priority,
    };

    // Error logging, justin case
    // eslint-disable-next-line no-console
    console.log("[useTodos.add] created todo:", todo);

    dispatch({ type: "ADD", todo });
  };

  const toggle = (id: string) => dispatch({ type: "TOGGLE", id });
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
  } as const;
}
