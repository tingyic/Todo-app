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

  return (
    <div className="p-3 rounded-lg border bg-slate-50 flex gap-3 items-start">
      <input type="checkbox" checked={todo.done} onChange={() => onToggle(todo.id)} />
      <div className="flex-1">
        {!editing ? (
          <>
            <div className={`text-sm ${todo.done ? "line-through text-slate-400" : "text-slate-800"}`}>
              {todo.text}
            </div>
            <div className="text-xs text-slate-500 mt-1 flex gap-2 flex-wrap">
              {todo.tags.length ? todo.tags.map(t => <span key={t} className="px-2 py-0.5 rounded-full border">#{t}</span>) : <span className="text-slate-400">no tags</span>}
              <span>{todo.due ? `Due ${todo.due}` : new Date(todo.createdAt).toLocaleDateString()}</span>
            </div>
          </>
        ) : (
          <div className="flex flex-col gap-2">
            <input className="rounded-md border p-1" value={draft.text} onChange={(e) => setDraft(d => ({ ...d, text: e.target.value }))} />
            <div className="flex gap-2">
              <input type="date" className="rounded-md border p-1" value={draft.due} onChange={(e) => setDraft(d => ({ ...d, due: e.target.value }))} />
              <input placeholder="tags: a, b" className="rounded-md border p-1 flex-1" value={draft.tags} onChange={(e) => setDraft(d => ({ ...d, tags: e.target.value }))} />
              <select value={draft.priority} onChange={(e) => setDraft(d => ({ ...d, priority: e.target.value as Priority }))} className="rounded-md border p-1">
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
            </div>
          </div>
        )}
      </div>
      <div className="flex flex-col gap-2 items-end">
        {editing ? (
          <>
            <button onClick={save} className="px-3 py-1 rounded bg-slate-800 text-white">Save</button>
            <button onClick={() => setEditing(false)} className="px-3 py-1 rounded border">Cancel</button>
          </>
        ) : (
          <>
            <button onClick={() => { setEditing(true); setDraft({ text: todo.text, due: todo.due ?? "", tags: todo.tags.join(", "), priority: todo.priority }); }} className="text-sm underline">Edit</button>
            <button onClick={() => onRemove(todo.id)} className="text-sm text-red-600">Delete</button>
          </>
        )}
      </div>
    </div>
  );
}