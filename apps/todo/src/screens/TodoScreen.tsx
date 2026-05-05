import React, { useState } from 'react';
import { 
  useGetTodosQuery, 
  useAddTodoMutation, 
  useToggleTodoMutation, 
  useDeleteTodoMutation 
} from '../store/services/todoApi';
import { TodoItem } from '../components/TodoItem';
import { Plus, Loader2, ListTodo } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

type FilterStatus = 'all' | 'active' | 'completed';

export const TodoScreen: React.FC = () => {
  const [newTodoTitle, setNewTodoTitle] = useState('');
  const [filter, setFilter] = useState<FilterStatus>('all');

  const { data: todos = [], isLoading, isError, refetch } = useGetTodosQuery();
  const [addTodo, { isLoading: isAdding }] = useAddTodoMutation();
  const [toggleTodo] = useToggleTodoMutation();
  const [deleteTodo] = useDeleteTodoMutation();

  const handleAddTodo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTodoTitle.trim() || isAdding) return;

    try {
      await addTodo(newTodoTitle.trim()).unwrap();
      setNewTodoTitle('');
    } catch (err) {
      console.error('Failed to add todo:', err);
    }
  };

  const filteredTodos = todos.filter((todo) => {
    if (filter === 'active') return !todo.completed;
    if (filter === 'completed') return todo.completed;
    return true;
  });

  const activeCount = todos.filter((t) => !t.completed).length;

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] space-y-4">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        <p className="text-gray-500 font-medium">Loading your tasks...</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-6 text-center">
        <p className="text-red-600 font-medium mb-4">Failed to load todos.</p>
        <button 
          onClick={() => refetch()}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 transition-colors"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto space-y-6">
      <header className="flex items-center space-x-3 mb-8">
        <div className="bg-blue-600 p-2 rounded-lg">
          <ListTodo className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-extrabold text-gray-900 tracking-tight">
          My Tasks
        </h1>
      </header>

      {/* Input Form */}
      <form 
        onSubmit={handleAddTodo}
        className="relative group"
      >
        <input
          type="text"
          value={newTodoTitle}
          onChange={(e) => setNewTodoTitle(e.target.value)}
          placeholder="What needs to be done?"
          className="w-full pl-4 pr-12 py-4 bg-white border-2 border-transparent rounded-xl shadow-sm focus:border-blue-500 focus:ring-0 transition-all outline-none text-lg placeholder:text-gray-400 group-hover:shadow-md"
          disabled={isAdding}
        />
        <button
          type="submit"
          disabled={!newTodoTitle.trim() || isAdding}
          className="absolute right-2 top-2 bottom-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:bg-gray-400 transition-all flex items-center justify-center"
        >
          {isAdding ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <Plus className="w-6 h-6" />
          )}
        </button>
      </form>

      {/* List Container */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {filteredTodos.length > 0 ? (
          <div className="divide-y divide-gray-100">
            {filteredTodos.map((todo) => (
              <TodoItem
                key={todo.id}
                todo={todo}
                onToggle={(id, completed) => toggleTodo({ id, completed })}
                onDelete={(id) => deleteTodo(id)}
              />
            ))}
          </div>
        ) : (
          <div className="p-12 text-center">
            <p className="text-gray-400 text-lg">
              {filter === 'all' 
                ? "No tasks yet. Add one above!" 
                : filter === 'active' 
                  ? "No active tasks. Good job!" 
                  : "No completed tasks yet."}
            </p>
          </div>
        )}

        {/* Footer / Filters */}
        {todos.length > 0 && (
          <div className="px-4 py-3 bg-gray-50 border-t border-gray-100 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-gray-500">
            <span className="font-medium">
              {activeCount} {activeCount === 1 ? 'item' : 'items'} left
            </span>
            
            <div className="flex items-center bg-gray-200 p-1 rounded-lg">
              {(['all', 'active', 'completed'] as FilterStatus[]).map((status) => (
                <button
                  key={status}
                  onClick={() => setFilter(status)}
                  className={cn(
                    "px-4 py-1.5 rounded-md capitalize transition-all font-medium",
                    filter === status 
                      ? "bg-white text-blue-600 shadow-sm" 
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  {status}
                </button>
              ))}
            </div>

            <div className="sm:w-20" /> {/* Spacer for balance */}
          </div>
        )}
      </div>
    </div>
  );
};
