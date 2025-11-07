import React, { useEffect, useState } from "react";

type Todo = {
  id: string;
  text: string;
  done: boolean;
  createdAt: number;
};

const LOCAL_KEY = "todoapp:v1";

function uid() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export default function App(): JSX.Element {
  const [todos, setTodos] = useState<Todo[]>(() => {
    try {
      const raw = localStorage.getItem(LOCAL_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Todo[];
    } catch {
      return [];
    }
  });

  const [text, setText] = useState("");

  // persist todos to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(LOCAL_KEY, JSON.stringify(todos));
    } catch (e) {
      console.warn("couldn't save todos", e);
    }
  }, [todos]);

  function addTodo(e?: React.FormEvent) {
    e?.preventDefault();
    const t = text.trim();
    if (!t) return;
    const newTodo: Todo = { id: uid(), text: t, done: false, createdAt: Date.now() };
    setTodos((s) => [newTodo, ...s]);
    setText("");
  }

  function toggleTodo(id: string) {
    setTodos((s) => s.map(t => (t.id === id ? { ...t, done: !t.done } : t)));
  }

  function removeTodo(id: string) {
    setTodos((s) => s.filter(t => t.id !== id));
  }

  const remaining = todos.filter(t => !t.done).length;
  const completed = todos.filter(t => t.done).length;

  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", padding: 20, fontFamily: "Inter, system-ui, sans-serif" }}>
      <div style={{ maxWidth: 780, margin: "0 auto", background: "white", padding: 20, borderRadius: 12, boxShadow: "0 6px 20px rgba(2,6,23,0.06)" }}>
        <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h1 style={{ margin: 0, fontSize: 20 }}>Todo — simple</h1>
          <div style={{ color: "#6b7280", fontSize: 13 }}>{remaining} left • {completed} done</div>
        </header>

        <form onSubmit={addTodo} style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="What needs doing? (Enter to add)"
            style={{ flex: 1, padding: "8px 12px", borderRadius: 8, border: "1px solid #e5e7eb" }}
            autoFocus
          />
          <button type="submit" style={{ padding: "8px 12px", borderRadius: 8, border: "none", background: "#111827", color: "white" }}>
            Add
          </button>
        </form>

        <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
          <button onClick={() => setTodos(todos.map(x => ({ ...x, done: true })))} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>✓ All</button>
          <button onClick={() => setTodos(todos.map(x => ({ ...x, done: false })))} style={{ padding: "6px 10px", borderRadius: 8, border: "1px solid #e5e7eb" }}>⨯ All</button>
          <button onClick={() => { if (confirm("Clear completed todos?")) setTodos(todos.filter(t => !t.done)); }} style={{ padding: "6px 10px", marginLeft: "auto", borderRadius: 8, border: "1px solid #e5e7eb" }}>Clear completed</button>
        </div>

        <ul style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 8 }}>
          {todos.length === 0 && <li style={{ color: "#9ca3af", textAlign: "center", padding: 20 }}>No todos yet — add one above</li>}
          {todos.map(todo => (
            <li key={todo.id} style={{ display: "flex", gap: 12, alignItems: "center", padding: 12, borderRadius: 10, border: "1px solid #eef2f7", background: "#fbfdff" }}>
              <input type="checkbox" checked={todo.done} onChange={() => toggleTodo(todo.id)} />
              <div style={{ flex: 1 }}>
                <div style={{ textDecoration: todo.done ? "line-through" : "none", color: todo.done ? "#9ca3af" : "#0f172a" }}>{todo.text}</div>
                <div style={{ fontSize: 12, color: "#6b7280", marginTop: 6 }}>{new Date(todo.createdAt).toLocaleString()}</div>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={() => removeTodo(todo.id)} style={{ padding: "6px 8px", borderRadius: 8, border: "1px solid #fdecea", background: "#fff7f6", color: "#b91c1c" }}>Delete</button>
              </div>
            </li>
          ))}
        </ul>

        <footer style={{ marginTop: 16, color: "#6b7280", fontSize: 13, display: "flex", justifyContent: "space-between" }}>
          <div>{todos.length} item(s)</div>
          <div>Local only • No backend yet</div>
        </footer>
      </div>
    </div>
  );
}

export default App
