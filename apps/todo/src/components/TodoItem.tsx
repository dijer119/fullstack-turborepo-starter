import React from 'react';
import { Circle, CheckCircle2, Trash2 } from 'lucide-react';
import { Todo } from '../store/services/todoApi';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface TodoItemProps {
  todo: Todo;
  onToggle: (id: number, completed: boolean) => void;
  onDelete: (id: number) => void;
  isToggling?: boolean;
  isDeleting?: boolean;
}

export const TodoItem: React.FC<TodoItemProps> = ({
  todo,
  onToggle,
  onDelete,
  isToggling,
  isDeleting,
}) => {
  return (
    <div className="group flex items-center justify-between p-4 bg-white border-b last:border-b-0 hover:bg-gray-50 transition-colors">
      <div className="flex items-center space-x-3 flex-1">
        <button
          onClick={() => onToggle(todo.id, !todo.completed)}
          disabled={isToggling}
          className={cn(
            "text-gray-400 hover:text-blue-500 transition-colors disabled:opacity-50",
            todo.completed && "text-blue-500"
          )}
        >
          {todo.completed ? (
            <CheckCircle2 className="w-6 h-6" />
          ) : (
            <Circle className="w-6 h-6" />
          )}
        </button>
        <span
          className={cn(
            "text-gray-700 transition-all",
            todo.completed && "text-gray-400 line-through"
          )}
        >
          {todo.title}
        </span>
      </div>
      <button
        onClick={() => onDelete(todo.id)}
        disabled={isDeleting}
        className="text-gray-400 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100 disabled:opacity-50 p-1"
        aria-label="Delete todo"
      >
        <Trash2 className="w-5 h-5" />
      </button>
    </div>
  );
};
