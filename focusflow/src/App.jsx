import { useCallback } from 'react';
import Header from './components/Header';
import PomodoroTimer from './components/PomodoroTimer';
import TaskManager from './components/TaskManager';
import Statistics from './components/Statistics';
import QuotesWidget from './components/QuotesWidget';
import { useDarkMode } from './hooks/useDarkMode';
import { useLocalStorage } from './hooks/useLocalStorage';

export default function App() {
  const [isDark, setIsDark] = useDarkMode();
  const [tasks, setTasks] = useLocalStorage('focusflow-tasks', []);
  const [sessions, setSessions] = useLocalStorage('focusflow-sessions', []);

  const handleSessionComplete = useCallback(() => {
    setSessions(prev => [
      ...prev,
      { date: new Date().toISOString(), duration: 25 },
    ]);
  }, [setSessions]);

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <div className="max-w-6xl mx-auto">
        <Header isDark={isDark} toggleDark={() => setIsDark(d => !d)} />

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Column */}
          <div className="lg:col-span-4 space-y-6">
            <PomodoroTimer onSessionComplete={handleSessionComplete} />
            <QuotesWidget />
          </div>

          {/* Center Column */}
          <div className="lg:col-span-4">
            <TaskManager tasks={tasks} setTasks={setTasks} />
          </div>

          {/* Right Column */}
          <div className="lg:col-span-4">
            <Statistics sessions={sessions} tasks={tasks} />
          </div>
        </div>

        <footer className="mt-12 text-center text-xs text-surface-400 pb-4">
          FocusFlow — Build focus, track progress, stay productive.
        </footer>
      </div>
    </div>
  );
}
