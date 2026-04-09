import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Plus, Check, Trash2, ListTodo,
  AlertTriangle, AlertCircle, Minus,
  Briefcase, User, Heart, BookOpen, Tag,
  Filter,
} from 'lucide-react';

const PRIORITIES = {
  high: { label: 'Alta', color: '#ef4444', icon: AlertTriangle },
  medium: { label: 'Media', color: '#f59e0b', icon: AlertCircle },
  low: { label: 'Baja', color: '#10b981', icon: Minus },
};

const CATEGORIES = [
  { value: 'work', label: 'Trabajo', icon: Briefcase, color: '#3b82f6' },
  { value: 'personal', label: 'Personal', icon: User, color: '#8b5cf6' },
  { value: 'health', label: 'Salud', icon: Heart, color: '#ef4444' },
  { value: 'learning', label: 'Aprendizaje', icon: BookOpen, color: '#f59e0b' },
  { value: 'general', label: 'General', icon: Tag, color: '#64748b' },
];

const FILTERS = ['all', 'active', 'completed'];
const FILTER_LABELS = { all: 'Todas', active: 'Activas', completed: 'Completadas' };

export default function TaskManager({ tasks, setTasks }) {
  const [newTask, setNewTask] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('general');
  const [filter, setFilter] = useState('all');
  const [showForm, setShowForm] = useState(false);

  const addTask = (e) => {
    e.preventDefault();
    if (!newTask.trim()) return;
    const task = {
      id: Date.now(),
      text: newTask.trim(),
      priority,
      category,
      completed: false,
      createdAt: new Date().toISOString(),
    };
    setTasks(prev => [task, ...prev]);
    setNewTask('');
    setShowForm(false);
  };

  const toggleTask = (id) => {
    setTasks(prev =>
      prev.map(t => t.id === id ? { ...t, completed: !t.completed } : t)
    );
  };

  const deleteTask = (id) => {
    setTasks(prev => prev.filter(t => t.id !== id));
  };

  const filtered = tasks.filter(t => {
    if (filter === 'active') return !t.completed;
    if (filter === 'completed') return t.completed;
    return true;
  });

  const activeCount = tasks.filter(t => !t.completed).length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="bg-white dark:bg-surface-900 rounded-2xl p-6 shadow-lg shadow-surface-200/50 dark:shadow-surface-900/50 border border-surface-200 dark:border-surface-800"
    >
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <ListTodo className="w-5 h-5 text-primary-500" />
          <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200">Tareas</h2>
          <span className="text-xs bg-primary-100 dark:bg-primary-900/30 text-primary-600 dark:text-primary-400 px-2 py-0.5 rounded-full font-medium">
            {activeCount} activas
          </span>
        </div>
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => setShowForm(!showForm)}
          className="p-2 rounded-lg bg-primary-500 text-white hover:bg-primary-600 transition-colors"
        >
          <Plus className="w-4 h-4" />
        </motion.button>
      </div>

      {/* Add Task Form */}
      <AnimatePresence>
        {showForm && (
          <motion.form
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            onSubmit={addTask}
            className="overflow-hidden mb-4"
          >
            <div className="space-y-3 p-4 bg-surface-50 dark:bg-surface-800/50 rounded-xl">
              <input
                type="text"
                value={newTask}
                onChange={e => setNewTask(e.target.value)}
                placeholder="Nueva tarea..."
                autoFocus
                className="w-full px-4 py-2.5 rounded-lg bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 text-surface-800 dark:text-surface-200 placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500/40 transition-shadow"
              />

              <div className="flex flex-wrap gap-2">
                <div className="flex gap-1">
                  {Object.entries(PRIORITIES).map(([key, p]) => {
                    const Icon = p.icon;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPriority(key)}
                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                          priority === key
                            ? 'ring-2 shadow-sm'
                            : 'opacity-50 hover:opacity-80'
                        }`}
                        style={{
                          backgroundColor: priority === key ? `${p.color}15` : 'transparent',
                          color: p.color,
                          ringColor: p.color,
                        }}
                      >
                        <Icon className="w-3 h-3" />
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map(c => {
                  const Icon = c.icon;
                  return (
                    <button
                      key={c.value}
                      type="button"
                      onClick={() => setCategory(c.value)}
                      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-all ${
                        category === c.value
                          ? 'ring-2 shadow-sm'
                          : 'opacity-50 hover:opacity-80'
                      }`}
                      style={{
                        backgroundColor: category === c.value ? `${c.color}15` : 'transparent',
                        color: c.color,
                        ringColor: c.color,
                      }}
                    >
                      <Icon className="w-3 h-3" />
                      {c.label}
                    </button>
                  );
                })}
              </div>

              <button
                type="submit"
                disabled={!newTask.trim()}
                className="w-full py-2.5 rounded-lg bg-primary-500 text-white font-medium hover:bg-primary-600 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                Agregar Tarea
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Filter Tabs */}
      <div className="flex gap-1 mb-4 bg-surface-100 dark:bg-surface-800 rounded-lg p-1">
        {FILTERS.map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`relative flex-1 py-1.5 px-2 rounded-md text-xs font-medium transition-colors ${
              filter === f
                ? 'text-white'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
          >
            {filter === f && (
              <motion.div
                layoutId="filterTab"
                className="absolute inset-0 bg-primary-500 rounded-md"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{FILTER_LABELS[f]}</span>
          </button>
        ))}
      </div>

      {/* Task List */}
      <div className="space-y-2 max-h-80 overflow-y-auto pr-1 custom-scrollbar">
        <AnimatePresence mode="popLayout">
          {filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8 text-surface-400"
            >
              <Filter className="w-8 h-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No hay tareas {filter !== 'all' ? FILTER_LABELS[filter].toLowerCase() : ''}</p>
            </motion.div>
          ) : (
            filtered.map(task => {
              const pri = PRIORITIES[task.priority];
              const cat = CATEGORIES.find(c => c.value === task.category) || CATEGORIES[4];
              const CatIcon = cat.icon;
              return (
                <motion.div
                  key={task.id}
                  layout
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: 20, scale: 0.9 }}
                  transition={{ duration: 0.2 }}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
                    task.completed
                      ? 'bg-surface-50 dark:bg-surface-800/30 border-surface-100 dark:border-surface-800'
                      : 'bg-white dark:bg-surface-800/50 border-surface-200 dark:border-surface-700 hover:shadow-md'
                  }`}
                >
                  <motion.button
                    whileTap={{ scale: 0.8 }}
                    onClick={() => toggleTask(task.id)}
                    className={`flex-shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      task.completed
                        ? 'bg-green-500 border-green-500'
                        : 'border-surface-300 dark:border-surface-600 hover:border-green-400'
                    }`}
                  >
                    {task.completed && <Check className="w-3 h-3 text-white" />}
                  </motion.button>

                  <div className="flex-1 min-w-0">
                    <p className={`text-sm truncate ${
                      task.completed
                        ? 'line-through text-surface-400'
                        : 'text-surface-800 dark:text-surface-200'
                    }`}>
                      {task.text}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <span
                        className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: `${pri.color}15`, color: pri.color }}
                      >
                        {pri.label}
                      </span>
                      <span className="flex items-center gap-0.5 text-[10px] text-surface-400">
                        <CatIcon className="w-2.5 h-2.5" />
                        {cat.label}
                      </span>
                    </div>
                  </div>

                  <motion.button
                    whileTap={{ scale: 0.8 }}
                    onClick={() => deleteTask(task.id)}
                    className="flex-shrink-0 p-1.5 rounded-lg text-surface-300 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </motion.button>
                </motion.div>
              );
            })
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}
