import { useEffect, useReducer } from "react";
import type { Todo, Priority } from "../types";

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
      console.warn("Failed to load todos:", e);
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

  // persist
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(state.todos));
    } catch (e) {
      console.warn("Failed to save todos:", e);
    }
  }, [state.todos]);

  // actions
  const add = (text: string) => {
    const todo: Todo = {
      id: uid(),
      text: text.trim(),
      done: false,
      createdAt: Date.now(),
      due: null,
      tags: [],
      priority: "medium",
    };
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
  };
}
