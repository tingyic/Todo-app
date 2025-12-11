import type { Todo } from "../types";
import TodoItem from "./TodoItem";

type Props = {
  todos: Todo[];
  onToggle: (id: string, createNext?: boolean | null) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Todo>, toastMsg?: string) => void;
  dustingIds?: Set<string>;
  selectedId?: string | null;
  setSelectedId?: (id: string | null) => void;
  showToast?: (msg: string, ms?: number) => void;
};

export default function TodoList({ todos, onToggle, onRemove, onUpdate, dustingIds, selectedId, setSelectedId, showToast }: Props) {
  if (!todos.length) return <div className="text-center text-slate-400 mt-6">No todos</div>;
  return (
    <ul className="todo-list space-y-2">
      {todos.map((todo, i) => (
        <li key={todo.id}>
          <TodoItem
            index={i}
            todo={todo}
            onToggle={onToggle}
            onRemove={onRemove}
            onUpdate={onUpdate}
            isDusting={!!dustingIds?.has(todo.id)}
            isSelected={selectedId === todo.id}
            onSelect={(id) => {
              if (setSelectedId) setSelectedId(id);
            }}
            showToast={showToast}
          />
        </li>
      ))}
    </ul>
  );
}