import { useState } from "react";
import type { Todo, Priority } from "../types";

type Props = {
  todo: Todo;
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Todo>) => void;
};

export default function TodoItem({ todo, onToggle, onRemove, onUpdate }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    text: todo.text,
    due: todo.due ?? "",
    tags: todo.tags.join(", "),
    priority: todo.priority as Priority,
  });

  function save() {
    onUpdate(todo.id, {
      text: draft.text.trim() || todo.text,
      due: draft.due || null,
      tags: draft.tags.split(",").map(s => s.trim()).filter(Boolean),
      priority: draft.priority,
    });
    setEditing(false);
  }

  // root gets class 'todo-done' when completed — CSS will style strikethrough & muted colors
  return (
    <div className={`todo-item ${todo.done ? "todo-done" : ""}`}>
      {/* left column: checkbox */}
      <div className="todo-col-checkbox">
        <input aria-label="Toggle todo" type="checkbox" checked={todo.done} onChange={() => onToggle(todo.id)} />
      </div>

      {/* main content */}
      <div className="todo-col-content">
        {!editing ? (
          <>
            {/* Title — add a priority class so we can color-code it */}
            <div className={`todo-title prio-${todo.priority}`}>{todo.text}</div>

            {/* tags on their own line */}
            <div className="todo-tags" aria-hidden={todo.tags.length === 0}>
              {todo.tags.length ? (
                todo.tags.map(t => <span key={t} className="tag">#{t}</span>)
              ) : (
                <span className="no-tags">no tags</span>
              )}
            </div>

            {/* date + priority badge on separate meta line */}
            <div className="todo-meta">
              <span className="todo-date">{todo.due ? `Due ${todo.due}` : new Date(todo.createdAt).toLocaleDateString()}</span>
              <span className={`priority-badge prio-${todo.priority}`}>{todo.priority}</span>
            </div>
          </>
        ) : (
          <>
            <input className="editor-input" value={draft.text} onChange={(e) => setDraft(d => ({ ...d, text: e.target.value }))} />
            <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
              <input type="date" className="editor-input" value={draft.due} onChange={(e) => setDraft(d => ({ ...d, due: e.target.value }))} />
              <input className="editor-input" placeholder="tags: a, b" value={draft.tags} onChange={(e) => setDraft(d => ({ ...d, tags: e.target.value }))} />
              <select value={draft.priority} onChange={(e) => setDraft(d => ({ ...d, priority: e.target.value as Priority }))} className="editor-input" style={{ width: 120 }}>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
            <div style={{ marginTop: 8 }}>
              <button onClick={save} className="btn-plain">Save</button>
              <button onClick={() => setEditing(false)} className="btn-plain" style={{ marginLeft: 8 }}>Cancel</button>
            </div>
          </>
        )}
      </div>

      {/* actions column */}
      <div className="todo-col-actions">
        {!editing ? (
          <>
            <button className="btn-plain" onClick={() => { setEditing(true); setDraft({ text: todo.text, due: todo.due ?? "", tags: todo.tags.join(", "), priority: todo.priority }); }}>Edit</button>
            <button className="btn-danger" onClick={() => onRemove(todo.id)}>Delete</button>
          </>
        ) : null}
      </div>
    </div>
  );
}
