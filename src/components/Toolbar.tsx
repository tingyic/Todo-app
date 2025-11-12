import type { ChangeEvent } from "react";

type Props = {
  filter: "all" | "active" | "completed";
  setFilter: (f: "all" | "active" | "completed") => void;
  query: string;
  setQuery: (q: string) => void;
  sortBy: "created" | "due" | "priority";
  setSortBy: (s: "created" | "due" | "priority") => void;
  clearCompleted: () => void;
  markAll: (done: boolean) => void;
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
}: Props) {
  function onSortChange(e: ChangeEvent<HTMLSelectElement>) {
    setSortBy(e.target.value as "created" | "due" | "priority");
  }

  return (
    <div className="toolbar flex gap-3 items-center mb-4">
      <div className="flex gap-1 bg-slate-50 rounded-md p-1">
        <button onClick={() => setFilter("all")} className={`px-3 py-1 rounded ${filter === "all" ? "bg-white shadow" : "text-slate-600"}`}>All</button>
        <button onClick={() => setFilter("active")} className={`px-3 py-1 rounded ${filter === "active" ? "bg-white shadow" : "text-slate-600"}`}>Active</button>
        <button onClick={() => setFilter("completed")} className={`px-3 py-1 rounded ${filter === "completed" ? "bg-white shadow" : "text-slate-600"}`}>Completed</button>
      </div>

      <div className="toolbar flex items-center gap-2 ml-auto">
        <input className="rounded-md border p-1 px-2 text-sm" placeholder="Search tags or text" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="rounded-md border p-1 text-sm" value={sortBy} onChange={onSortChange}>
          <option value="created">Newest</option>
          <option value="due">Due date</option>
          <option value="priority">Priority</option>
        </select>
        <button className="text-sm underline" onClick={() => { if (confirm("Clear completed todos?")) clearCompleted(); }}>Clear completed</button>
        <button onClick={() => markAll(true)} className="px-3 py-1 rounded border text-sm" title="Mark all done">✓ All</button>
        <button onClick={() => markAll(false)} className="px-3 py-1 rounded border text-sm" title="Mark all active">⨯ All</button>
      </div>
    </div>
  );
}