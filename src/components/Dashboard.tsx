import { useEffect } from 'react';
import { Pomodoro } from './Pomodoro';
import { TaskManager } from './TaskManager';
import { Statistics } from './Statistics';
import type { DailyStats } from './Statistics';
import { Quotes } from './Quotes';
import { Moon, Sun, LayoutDashboard } from 'lucide-react';
import { useLocalStorage } from '../hooks/useLocalStorage';

export function Dashboard() {
  const [theme, setTheme] = useLocalStorage<'light' | 'dark' | 'system'>('focusflow-theme', 'system');
  const [stats, setStats] = useLocalStorage<DailyStats[]>('focusflow-stats', []);

  useEffect(() => {
    const root = window.document.documentElement;
    
    const applyTheme = (currentTheme: 'light' | 'dark' | 'system') => {
      root.classList.remove('light', 'dark');
      
      if (currentTheme === 'system') {
        const systemTheme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
        root.classList.add(systemTheme);
      } else {
        root.classList.add(currentTheme);
      }
    };

    applyTheme(theme);

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const handleChange = () => {
      if (theme === 'system') {
        applyTheme('system');
      }
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, [theme]);

  const toggleTheme = () => {
    setTheme(theme === 'light' ? 'dark' : 'light');
  };

  const updateStats = (focusMinutes: number, tasksCompleted: number) => {
    const today = new Date().toISOString().split('T')[0];
    const newStats = [...stats];
    const todayIndex = newStats.findIndex(s => s.date === today);

    if (todayIndex >= 0) {
      newStats[todayIndex].focusMinutes += focusMinutes;
      newStats[todayIndex].tasksCompleted += tasksCompleted;
    } else {
      newStats.push({ date: today, focusMinutes, tasksCompleted });
    }

    setStats(newStats);
  };

  const handlePomodoroComplete = (mode: string) => {
    if (mode === 'focus') {
      updateStats(25, 0);
    }
  };

  const handleTaskComplete = () => {
    updateStats(0, 1);
  };

  return (
    <div className="min-h-screen bg-background text-foreground transition-colors duration-300">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-primary text-primary-foreground p-2 rounded-lg">
              <LayoutDashboard size={24} />
            </div>
            <h1 className="text-xl font-bold tracking-tight">FocusFlow</h1>
          </div>
          <button
            onClick={toggleTheme}
            className="p-2 rounded-full hover:bg-muted transition-colors text-muted-foreground hover:text-foreground"
            aria-label="Toggle theme"
          >
            {theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches) ? <Sun size={20} /> : <Moon size={20} />}
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Column */}
          <div className="lg:col-span-4 space-y-8">
            <Pomodoro onComplete={handlePomodoroComplete} />
            <Quotes />
          </div>

          {/* Middle/Right Column */}
          <div className="lg:col-span-8 space-y-8">
            <Statistics stats={stats} />
            <TaskManager onTaskComplete={handleTaskComplete} />
          </div>
        </div>
      </main>
    </div>
  );
}
