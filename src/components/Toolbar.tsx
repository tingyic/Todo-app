import type { ChangeEvent } from "react";
import type { Todo } from "../types";
import { saveToDisk, readFromDisk } from "../utils/electron";

type Props = {
  filter: "all" | "active" | "completed";
  setFilter: (f: "all" | "active" | "completed") => void;
  query: string;
  setQuery: (q: string) => void;
  sortBy: "created" | "due" | "priority";
  setSortBy: (s: "created" | "due" | "priority") => void;
  clearCompleted: () => void;
  markAll: (done: boolean) => void;
  todos: Todo[];
  setTodos: (t: Todo[]) => void;
  showToast: (msg: string, ms?: number) => void;
  view?: "list" | "year";
  setView?: (v: "list" | "year") => void;
};

export default function Toolbar({
  filter,
  setFilter,
  query,
  setQuery,
  sortBy,
  setSortBy,
  clearCompleted,
  markAll,
  todos,
  setTodos: setTodos,
  showToast,
  view,
  setView,
}: Props) {
  function onSortChange(e: ChangeEvent<HTMLSelectElement>) {
    setSortBy(e.target.value as "created" | "due" | "priority");
  }

  async function onSave() {
    try {
      const res = await saveToDisk("todos.json", todos);
      if (res.ok) {
        showToast("Saved to " + res.path, 2000);
      } else {
        showToast("Save failed: " + res.error, 3000);
      }
    } catch (err) {
      showToast("Save failed: " + String(err), 3000);
      console.error("saveToDisk error", err);
    } finally {
      setTimeout(() => document.getElementById("todo-add-input")?.focus(), 50);
    }
  }

  async function onLoad() {
    try {
      const res = await readFromDisk("todos.json");
      if (res.ok) {
        setTodos(res.data as Todo[]);
        showToast("Loaded from " + (res.path ?? "disk"), 2000);
      } else {
        showToast("Load failed: " + res.error, 3000);
      }
    } catch (err) {
      showToast("Load failed: " + String(err), 3000);
      console.error("readFromDisk error", err);
    } finally {
      setTimeout(() => document.getElementById("todo-add-input")?.focus(), 50);
    }
  }

  return (
    <div className="toolbar flex gap-3 items-center mb-4">
      <div className="flex gap-1 bg-slate-50 rounded-md p-1">
        <button onClick={() => setFilter("all")} className={`px-3 py-1 rounded ${filter === "all" ? "bg-white shadow" : "text-slate-600"}`}>All</button>
        <button onClick={() => setFilter("active")} className={`px-3 py-1 rounded ${filter === "active" ? "bg-white shadow" : "text-slate-600"}`}>Active</button>
        <button onClick={() => setFilter("completed")} className={`px-3 py-1 rounded ${filter === "completed" ? "bg-white shadow" : "text-slate-600"}`}>Completed</button>
      </div>

      <div className="toolbar flex items-center gap-2 ml-auto">
        {/* VIEW TOGGLE */}
        <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
          <button
            type="button"
            className={`px-2 py-1 rounded text-sm ${view === "list" ? "bg-white shadow" : "text-slate-600"}`}
            onClick={() => setView?.("list")}
            aria-pressed={view === "list"}
            title="List view"
          >
            List
          </button>
          <button 
            type="button"
            className={`px-2 py-1 rounded text-sm ${view === "year" ? "bg-white shadow" : "text-slate-600"}`}
            onClick={() => setView?.("year")}
            aria-pressed={view === "year"}
            title="Year view"
          >
            Year
          </button>
        </div>
        
        <input className="rounded-md border p-1 px-2 text-sm" placeholder="Search tags or text" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="rounded-md border p-1 text-sm" value={sortBy} onChange={onSortChange}>
          <option value="created">Newest</option>
          <option value="due">Due date</option>
          <option value="priority">Priority</option>
        </select> 

        <button onClick={onSave} className="px-3 py-1 border rounded text-sm">Save</button>
        <button onClick={onLoad} className="px-3 py-1 border rounded text-sm">Load</button>

        <button className="btn-danger clear-completed text-sm" onClick={() => { if (confirm("Are you sure u want to clear completed todos?")) clearCompleted(); }} title="Clear completed" aria-label="Clear completed todos">Clear completed</button>
        <button onClick={() => markAll(true)} className="px-3 py-1 rounded border text-sm" title="Mark all done">✓ All</button>
        <button onClick={() => markAll(false)} className="px-3 py-1 rounded border text-sm" title="Mark all active">⨯ All</button>
      </div>
    </div>
  );
}