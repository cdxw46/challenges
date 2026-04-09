import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { CheckCircle2, Circle, Trash2, Plus } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export type Priority = 'High' | 'Medium' | 'Low';
export type Category = 'Work' | 'Personal' | 'Health' | 'Learning' | 'General';

export interface Task {
  id: string;
  title: string;
  completed: boolean;
  priority: Priority;
  category: Category;
  createdAt: number;
}

const PRIORITIES: Record<Priority, string> = {
  High: 'text-red-500 bg-red-500/10 border-red-500/20',
  Medium: 'text-yellow-500 bg-yellow-500/10 border-yellow-500/20',
  Low: 'text-blue-500 bg-blue-500/10 border-blue-500/20',
};

const CATEGORIES: Category[] = ['Work', 'Personal', 'Health', 'Learning', 'General'];

export function TaskManager({ onTaskComplete }: { onTaskComplete: () => void }) {
  const [tasks, setTasks] = useLocalStorage<Task[]>('focusflow-tasks', []);
  const [newTask, setNewTask] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [category, setCategory] = useState<Category>('General');
  const [filter, setFilter] = useState<'All' | 'Active' | 'Completed'>('All');

  const addTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTask.trim()) return;

    const task: Task = {
      id: crypto.randomUUID(),
      title: newTask.trim(),
      completed: false,
      priority,
      category,
      createdAt: Date.now(),
    };

    setTasks([task, ...tasks]);
    setNewTask('');
  };

  const toggleTask = (id: string) => {
    setTasks(tasks.map((t) => {
      if (t.id === id) {
        if (!t.completed) onTaskComplete();
        return { ...t, completed: !t.completed };
      }
      return t;
    }));
  };

  const deleteTask = (id: string) => {
    setTasks(tasks.filter((t) => t.id !== id));
  };

  const filteredTasks = tasks.filter((t) => {
    if (filter === 'Active') return !t.completed;
    if (filter === 'Completed') return t.completed;
    return true;
  });

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border flex flex-col h-[600px] overflow-hidden">
      <div className="p-6 border-b border-border">
        <h2 className="text-xl font-semibold mb-4">Tasks</h2>
        
        <form onSubmit={addTask} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={newTask}
              onChange={(e) => setNewTask(e.target.value)}
              placeholder="What needs to be done?"
              className="flex-1 bg-background border border-input rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              type="submit"
              disabled={!newTask.trim()}
              className="bg-primary text-primary-foreground px-4 py-2 rounded-md hover:bg-primary/90 disabled:opacity-50 transition-colors"
            >
              <Plus size={20} />
            </button>
          </div>
          
          <div className="flex gap-2 text-sm">
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as Priority)}
              className="bg-background border border-input rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              <option value="High">High</option>
              <option value="Medium">Medium</option>
              <option value="Low">Low</option>
            </select>
            
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as Category)}
              className="bg-background border border-input rounded-md px-2 py-1 focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </form>
      </div>

      <div className="flex gap-2 p-4 border-b border-border bg-muted/50">
        {(['All', 'Active', 'Completed'] as const).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1 text-sm rounded-full transition-colors ${
              filter === f
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <AnimatePresence mode="popLayout">
          {filteredTasks.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="text-center text-muted-foreground mt-8"
            >
              No tasks found.
            </motion.div>
          ) : (
            filteredTasks.map((task) => (
              <motion.div
                key={task.id}
                layout
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`flex items-center gap-3 p-3 mb-2 rounded-lg border transition-colors ${
                  task.completed ? 'bg-muted/50 border-transparent opacity-60' : 'bg-background border-border hover:border-muted-foreground/30'
                }`}
              >
                <button
                  onClick={() => toggleTask(task.id)}
                  className={`flex-shrink-0 transition-colors ${
                    task.completed ? 'text-primary' : 'text-muted-foreground hover:text-primary'
                  }`}
                >
                  {task.completed ? <CheckCircle2 size={20} /> : <Circle size={20} />}
                </button>
                
                <div className="flex-1 min-w-0">
                  <p className={`text-sm truncate ${task.completed ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                    {task.title}
                  </p>
                  <div className="flex gap-2 mt-1">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-sm border ${PRIORITIES[task.priority]}`}>
                      {task.priority}
                    </span>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-sm bg-secondary text-secondary-foreground">
                      {task.category}
                    </span>
                  </div>
                </div>

                <button
                  onClick={() => deleteTask(task.id)}
                  className="flex-shrink-0 text-muted-foreground hover:text-destructive transition-colors p-1"
                >
                  <Trash2 size={16} />
                </button>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
