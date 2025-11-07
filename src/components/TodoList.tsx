import type { Todo } from "../types";
import TodoItem from "./TodoItem";

type Props = {
  todos: Todo[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Todo>) => void;
};

export default function TodoList({ todos, onToggle, onRemove, onUpdate }: Props) {
  if (!todos.length) return <div className="text-center text-slate-400 mt-6">No todos</div>;
  return (
    <ul className="space-y-2">
      {todos.map(t => (
        <li key={t.id}>
          <TodoItem todo={t} onToggle={onToggle} onRemove={onRemove} onUpdate={onUpdate} />
        </li>
      ))}
    </ul>
  );
}