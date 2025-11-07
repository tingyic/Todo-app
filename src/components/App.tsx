import { useMemo, useState } from "react";
import { useTodos } from "../hooks/useTodos";
import TodoEditor from "./TodoEditor";
import TodoList from "./TodoList";
import Toolbar from "./Toolbar";

export default function App() {
  const { todos, add, toggle, remove, update, clearCompleted, setAll } = useTodos();

  const [filter, setFilter] = useState<"all" | "active" | "completed">("all");
  const [query, setQuery] = useState("");
  const [sortBy, setSortBy] = useState<"created" | "due" | "priority">("created");

  const stats = useMemo(() => {
    const total = todos.length;
    const done = todos.filter(t => t.done).length;
    return { total, done, remaining: total - done };
  }, [todos]);

  const visible = useMemo(() => {
    let list = todos.slice();
    if (filter === "active") list = list.filter(t => !t.done);
    if (filter === "completed") list = list.filter(t => t.done);
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(t => t.text.toLowerCase().includes(q) || t.tags.join(" ").toLowerCase().includes(q));
    }
    if (sortBy === "due") {
      list.sort((a, b) => {
        if (!a.due && !b.due) return 0;
        if (!a.due) return 1;
        if (!b.due) return -1;
        return a.due!.localeCompare(b.due!);
      });
    } else if (sortBy === "priority") {
      const weight = { high: 0, medium: 1, low: 2 } as const;
      list.sort((a, b) => weight[a.priority] - weight[b.priority]);
    } else {
      list.sort((a, b) => b.createdAt - a.createdAt);
    }
    return list;
  }, [todos, filter, query, sortBy]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-white flex items-start justify-center py-12 px-4">
      <div className="w-full max-w-3xl bg-white rounded-2xl shadow-lg p-6">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-semibold">Todo</h1>
          <div className="text-sm text-slate-500">{stats.remaining} left • {stats.done} done</div>
        </header>

        <TodoEditor onAdd={add} />

        {/* Toolbar no longer needs total/done/remaining props */}
        <Toolbar
          filter={filter}
          setFilter={setFilter}
          query={query}
          setQuery={setQuery}
          sortBy={sortBy}
          setSortBy={setSortBy}
          clearCompleted={clearCompleted}
          markAll={setAll}
        />

        <main>
          <TodoList todos={visible} onToggle={toggle} onRemove={remove} onUpdate={update} />
        </main>

        <footer className="mt-6 flex items-center justify-between text-sm text-slate-500">
          <div>{stats.total} items</div>
          <div> Have a nice day :)</div>
          <div>Made by Ting Yi</div>
        </footer>
      </div>
    </div>
  );
}