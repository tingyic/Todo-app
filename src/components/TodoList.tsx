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
    <ul className="todo-list space-y-2">
      {todos.map((todo, i) => (
        <li key={todo.id}>
          {/* pass index prop so TodoItem can use it to set --i CSS var for stagger */
          /* index is not persisted; it's only for animation timing */}
          <TodoItem
            index={i}
            todo={todo}
            onToggle={onToggle}
            onRemove={onRemove}
            onUpdate={onUpdate}
          />
        </li>
      ))}
    </ul>
  );
}