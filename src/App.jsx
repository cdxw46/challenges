import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  CheckCircle2,
  Clock3,
  ListFilter,
  ListTodo,
  Moon,
  Pause,
  Play,
  Plus,
  Quote,
  RotateCcw,
  Sparkles,
  Sun,
  Target,
  Trash2,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

const STORAGE_KEYS = {
  tasks: 'focusflow.tasks',
  filter: 'focusflow.filter',
  theme: 'focusflow.theme',
  sessions: 'focusflow.sessions',
  quote: 'focusflow.quote',
  timer: 'focusflow.timer',
};

const TIMER_PRESETS = {
  focus: {
    id: 'focus',
    label: 'Focus',
    description: '25 minutos para concentrarte en lo importante.',
    minutes: 25,
    accent: '#8b5cf6',
    accentSoft: 'rgba(139, 92, 246, 0.18)',
    gradient: ['#8b5cf6', '#22d3ee'],
  },
  shortBreak: {
    id: 'shortBreak',
    label: 'Short Break',
    description: '5 minutos para resetear energia y volver fresco.',
    minutes: 5,
    accent: '#14b8a6',
    accentSoft: 'rgba(20, 184, 166, 0.18)',
    gradient: ['#14b8a6', '#2dd4bf'],
  },
  longBreak: {
    id: 'longBreak',
    label: 'Long Break',
    description: '15 minutos para bajar revoluciones y recuperar foco.',
    minutes: 15,
    accent: '#f97316',
    accentSoft: 'rgba(249, 115, 22, 0.18)',
    gradient: ['#fb923c', '#f59e0b'],
  },
};

const PRIORITY_META = {
  Alta: { color: '#f43f5e', background: 'rgba(244, 63, 94, 0.12)', border: 'rgba(244, 63, 94, 0.24)' },
  Media: { color: '#f59e0b', background: 'rgba(245, 158, 11, 0.12)', border: 'rgba(245, 158, 11, 0.24)' },
  Baja: { color: '#10b981', background: 'rgba(16, 185, 129, 0.12)', border: 'rgba(16, 185, 129, 0.24)' },
};

const CATEGORY_META = {
  Trabajo: { color: '#0ea5e9', background: 'rgba(14, 165, 233, 0.12)' },
  Personal: { color: '#d946ef', background: 'rgba(217, 70, 239, 0.12)' },
  Salud: { color: '#10b981', background: 'rgba(16, 185, 129, 0.12)' },
  Aprendizaje: { color: '#8b5cf6', background: 'rgba(139, 92, 246, 0.12)' },
  General: { color: '#64748b', background: 'rgba(100, 116, 139, 0.12)' },
};

const TASK_FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'active', label: 'Activas' },
  { id: 'completed', label: 'Completadas' },
];

const TASK_PRIORITIES = ['Alta', 'Media', 'Baja'];
const TASK_CATEGORIES = ['Trabajo', 'Personal', 'Salud', 'Aprendizaje', 'General'];

const QUOTES = [
  {
    text: 'La claridad llega cuando conviertes una gran meta en la siguiente accion.',
    author: 'James Clear',
  },
  {
    text: 'No necesitas mas tiempo. Necesitas menos distracciones.',
    author: 'FocusFlow',
  },
  {
    text: 'La consistencia gana cuando la motivacion se toma un descanso.',
    author: 'Atomic Habits',
  },
  {
    text: 'Un pomodoro bien hecho vale mas que una hora dispersa.',
    author: 'Productividad consciente',
  },
  {
    text: 'Descansar a tiempo tambien es parte del trabajo profundo.',
    author: 'Deep Work',
  },
];

const weekdayFormatter = new Intl.DateTimeFormat('es-ES', { weekday: 'short' });
const fullDateFormatter = new Intl.DateTimeFormat('es-ES', {
  day: 'numeric',
  month: 'short',
});

function getInitialValue(initialValue) {
  return typeof initialValue === 'function' ? initialValue() : initialValue;
}

function useLocalStorage(key, initialValue) {
  const [value, setValue] = useState(() => {
    if (typeof window === 'undefined') {
      return getInitialValue(initialValue);
    }

    try {
      const savedValue = window.localStorage.getItem(key);
      return savedValue ? JSON.parse(savedValue) : getInitialValue(initialValue);
    } catch {
      return getInitialValue(initialValue);
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore persistence failures for private browsing or restricted environments.
    }
  }, [key, value]);

  return [value, setValue];
}

function getLocalDateKey(value = new Date()) {
  const date = new Date(value);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function readStoredTimerState() {
  const fallbackMode = 'focus';
  const fallbackSeconds = TIMER_PRESETS[fallbackMode].minutes * 60;

  if (typeof window === 'undefined') {
    return {
      mode: fallbackMode,
      remainingSeconds: fallbackSeconds,
      isRunning: false,
      endsAt: null,
    };
  }

  try {
    const rawTimer = window.localStorage.getItem(STORAGE_KEYS.timer);
    if (!rawTimer) {
      return {
        mode: fallbackMode,
        remainingSeconds: fallbackSeconds,
        isRunning: false,
        endsAt: null,
      };
    }

    const parsed = JSON.parse(rawTimer);
    const mode = parsed?.mode && TIMER_PRESETS[parsed.mode] ? parsed.mode : fallbackMode;
    const presetSeconds = TIMER_PRESETS[mode].minutes * 60;
    const endsAt = Number.isFinite(parsed?.endsAt) ? parsed.endsAt : null;
    const savedRemaining = Number.isFinite(parsed?.remainingSeconds)
      ? Math.max(0, parsed.remainingSeconds)
      : presetSeconds;

    if (parsed?.isRunning && endsAt) {
      return {
        mode,
        isRunning: true,
        endsAt,
        remainingSeconds: Math.max(0, Math.ceil((endsAt - Date.now()) / 1000)),
      };
    }

    return {
      mode,
      isRunning: false,
      endsAt: null,
      remainingSeconds: savedRemaining || presetSeconds,
    };
  } catch {
    return {
      mode: fallbackMode,
      remainingSeconds: fallbackSeconds,
      isRunning: false,
      endsAt: null,
    };
  }
}

function formatTime(totalSeconds) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function formatRelativeDate(isoDate) {
  const created = new Date(isoDate);
  return new Intl.DateTimeFormat('es-ES', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(created);
}

function buildWeeklyData(sessionHistory) {
  const aggregated = sessionHistory.reduce((accumulator, session) => {
    const key = getLocalDateKey(session.date);
    const previous = accumulator[key] ?? { minutes: 0, sessions: 0 };

    accumulator[key] = {
      minutes: previous.minutes + session.minutes,
      sessions: previous.sessions + 1,
    };

    return accumulator;
  }, {});

  const start = new Date();
  start.setHours(0, 0, 0, 0);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(start);
    date.setDate(start.getDate() - (6 - index));

    const key = getLocalDateKey(date);
    const record = aggregated[key] ?? { minutes: 0, sessions: 0 };

    return {
      key,
      label: weekdayFormatter.format(date).replace('.', ''),
      fullLabel: fullDateFormatter.format(date),
      minutes: record.minutes,
      sessions: record.sessions,
    };
  });
}

function WeeklyTooltip({ active, payload }) {
  if (!active || !payload?.length) {
    return null;
  }

  const { fullLabel, minutes, sessions } = payload[0].payload;

  return (
    <div className="rounded-2xl border border-white/10 bg-slate-950/92 px-4 py-3 text-sm text-slate-100 shadow-2xl backdrop-blur">
      <p className="font-semibold">{fullLabel}</p>
      <p className="mt-1 text-slate-300">{minutes} min de enfoque</p>
      <p className="text-slate-400">{sessions} sesiones completadas</p>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, accent, subtitle }) {
  return (
    <motion.div
      layout
      whileHover={{ y: -4 }}
      className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-strong)] p-5 shadow-[0_14px_40px_rgba(15,23,42,0.12)]"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--text-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-semibold tracking-tight text-[var(--text)]">{value}</p>
          <p className="mt-2 text-sm text-[var(--text-muted)]">{subtitle}</p>
        </div>
        <div
          className="flex h-12 w-12 items-center justify-center rounded-2xl"
          style={{ backgroundColor: accent }}
        >
          <Icon className="h-6 w-6 text-white" />
        </div>
      </div>
    </motion.div>
  );
}

export default function App() {
  const [tasks, setTasks] = useLocalStorage(STORAGE_KEYS.tasks, []);
  const [taskFilter, setTaskFilter] = useLocalStorage(STORAGE_KEYS.filter, 'all');
  const [sessionHistory, setSessionHistory] = useLocalStorage(STORAGE_KEYS.sessions, []);
  const [themeMode, setThemeMode] = useLocalStorage(STORAGE_KEYS.theme, 'system');
  const [quoteIndex, setQuoteIndex] = useLocalStorage(STORAGE_KEYS.quote, 0);
  const [timerState, setTimerState] = useState(readStoredTimerState);

  const [taskTitle, setTaskTitle] = useState('');
  const [taskPriority, setTaskPriority] = useState('Alta');
  const [taskCategory, setTaskCategory] = useState('Trabajo');
  const [systemTheme, setSystemTheme] = useState(() => {
    if (typeof window === 'undefined') {
      return 'dark';
    }

    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  const [hoveredDay, setHoveredDay] = useState(null);
  const [notice, setNotice] = useState(null);

  const currentPreset = TIMER_PRESETS[timerState.mode];
  const timerTotalSeconds = currentPreset.minutes * 60;
  const progress = Math.min(1, Math.max(0, 1 - timerState.remainingSeconds / timerTotalSeconds));
  const resolvedTheme = themeMode === 'system' ? systemTheme : themeMode;

  const ringRadius = 120;
  const ringCircumference = 2 * Math.PI * ringRadius;
  const ringOffset = ringCircumference * (1 - progress);

  const filteredTasks = useMemo(() => {
    if (taskFilter === 'active') {
      return tasks.filter((task) => !task.completed);
    }

    if (taskFilter === 'completed') {
      return tasks.filter((task) => task.completed);
    }

    return tasks;
  }, [taskFilter, tasks]);

  const completedTasksCount = useMemo(
    () => tasks.filter((task) => task.completed).length,
    [tasks],
  );
  const activeTasksCount = tasks.length - completedTasksCount;

  const totalFocusedMinutes = useMemo(
    () => sessionHistory.reduce((total, session) => total + session.minutes, 0),
    [sessionHistory],
  );

  const totalHoursLabel = `${(totalFocusedMinutes / 60).toFixed(totalFocusedMinutes >= 600 ? 0 : 1)} h`;
  const todayKey = getLocalDateKey();
  const todayMinutes = useMemo(
    () =>
      sessionHistory
        .filter((session) => getLocalDateKey(session.date) === todayKey)
        .reduce((total, session) => total + session.minutes, 0),
    [sessionHistory, todayKey],
  );

  const weeklyData = useMemo(() => buildWeeklyData(sessionHistory), [sessionHistory]);
  const weeklyFocusMinutes = weeklyData.reduce((total, day) => total + day.minutes, 0);
  const currentQuote = QUOTES[quoteIndex % QUOTES.length];

  const showNotice = useCallback((title, message) => {
    setNotice({ title, message });
  }, []);

  const completeTimer = useCallback(
    (mode) => {
      const preset = TIMER_PRESETS[mode];

      setTimerState({
        mode,
        remainingSeconds: preset.minutes * 60,
        isRunning: false,
        endsAt: null,
      });

      if (mode === 'focus') {
        setSessionHistory((previous) => [
          {
            id: crypto.randomUUID(),
            date: new Date().toISOString(),
            minutes: preset.minutes,
          },
          ...previous,
        ]);

        showNotice('Sesion completada', `Sumaste ${preset.minutes} minutos de trabajo profundo.`);
      } else {
        showNotice('Descanso completado', 'Listo para volver a entrar en flow.');
      }
    },
    [setSessionHistory, showNotice],
  );

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEYS.timer, JSON.stringify(timerState));
    } catch {
      // Ignore persistence failures.
    }
  }, [timerState]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return undefined;
    }

    const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
    const updateSystemTheme = (event) => setSystemTheme(event.matches ? 'dark' : 'light');

    setSystemTheme(mediaQuery.matches ? 'dark' : 'light');
    mediaQuery.addEventListener('change', updateSystemTheme);

    return () => mediaQuery.removeEventListener('change', updateSystemTheme);
  }, []);

  useEffect(() => {
    document.documentElement.classList.remove('theme-light', 'theme-dark');
    document.documentElement.classList.add(resolvedTheme === 'dark' ? 'theme-dark' : 'theme-light');
  }, [resolvedTheme]);

  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timeout = window.setTimeout(() => setNotice(null), 3600);
    return () => window.clearTimeout(timeout);
  }, [notice]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setQuoteIndex((previous) => (previous + 1) % QUOTES.length);
    }, 30000);

    return () => window.clearInterval(interval);
  }, [setQuoteIndex]);

  useEffect(() => {
    if (timerState.isRunning && timerState.endsAt && timerState.remainingSeconds <= 0) {
      completeTimer(timerState.mode);
    }
  }, [completeTimer, timerState.endsAt, timerState.isRunning, timerState.mode, timerState.remainingSeconds]);

  useEffect(() => {
    if (!timerState.isRunning || !timerState.endsAt) {
      return undefined;
    }

    const tick = () => {
      const nextRemaining = Math.max(0, Math.ceil((timerState.endsAt - Date.now()) / 1000));

      if (nextRemaining <= 0) {
        completeTimer(timerState.mode);
        return;
      }

      setTimerState((previous) =>
        previous.remainingSeconds === nextRemaining
          ? previous
          : { ...previous, remainingSeconds: nextRemaining },
      );
    };

    tick();
    const interval = window.setInterval(tick, 250);

    return () => window.clearInterval(interval);
  }, [completeTimer, timerState.endsAt, timerState.isRunning, timerState.mode]);

  function handleTaskSubmit(event) {
    event.preventDefault();

    const trimmedTitle = taskTitle.trim();
    if (!trimmedTitle) {
      showNotice('Falta una tarea', 'Escribe un titulo corto para agregarla al dashboard.');
      return;
    }

    setTasks((previous) => [
      {
        id: crypto.randomUUID(),
        title: trimmedTitle,
        priority: taskPriority,
        category: taskCategory,
        completed: false,
        createdAt: new Date().toISOString(),
      },
      ...previous,
    ]);
    setTaskTitle('');
    showNotice('Tarea creada', `Has agregado "${trimmedTitle}".`);
  }

  function toggleTask(taskId) {
    let completedNow = false;

    setTasks((previous) =>
      previous.map((task) => {
        if (task.id !== taskId) {
          return task;
        }

        completedNow = !task.completed;
        return { ...task, completed: !task.completed };
      }),
    );

    if (completedNow) {
      showNotice('Tarea completada', 'Buen trabajo. Sigue con el siguiente bloque.');
    }
  }

  function deleteTask(taskId) {
    setTasks((previous) => previous.filter((task) => task.id !== taskId));
    showNotice('Tarea eliminada', 'La tarea salio de tu lista.');
  }

  function switchTimerMode(mode) {
    const preset = TIMER_PRESETS[mode];
    setTimerState({
      mode,
      remainingSeconds: preset.minutes * 60,
      isRunning: false,
      endsAt: null,
    });
  }

  function toggleTimer() {
    if (timerState.isRunning) {
      setTimerState((previous) => ({
        ...previous,
        isRunning: false,
        endsAt: null,
        remainingSeconds: Math.max(
          0,
          previous.endsAt ? Math.ceil((previous.endsAt - Date.now()) / 1000) : previous.remainingSeconds,
        ),
      }));
      return;
    }

    setTimerState((previous) => ({
      ...previous,
      isRunning: true,
      endsAt: Date.now() + previous.remainingSeconds * 1000,
    }));
  }

  function resetTimer() {
    setTimerState((previous) => ({
      mode: previous.mode,
      remainingSeconds: TIMER_PRESETS[previous.mode].minutes * 60,
      isRunning: false,
      endsAt: null,
    }));
  }

  return (
    <div className="min-h-screen px-4 py-6 sm:px-6 lg:px-8">
      <AnimatePresence>
        {notice ? (
          <motion.div
            key={notice.title}
            initial={{ opacity: 0, y: -24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -16, scale: 0.96 }}
            className="fixed inset-x-4 top-4 z-50 mx-auto w-full max-w-md rounded-3xl border border-white/10 bg-slate-950/90 p-4 text-white shadow-2xl backdrop-blur"
          >
            <p className="font-semibold">{notice.title}</p>
            <p className="mt-1 text-sm text-slate-300">{notice.message}</p>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <div className="mx-auto flex max-w-7xl flex-col gap-6">
        <motion.header
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel overflow-hidden rounded-[32px] p-6 sm:p-8"
        >
          <div className="grid gap-6 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-[var(--text-muted)]">
                <Sparkles className="h-4 w-4 text-violet-400" />
                FocusFlow
              </div>
              <h1 className="mt-4 max-w-3xl text-4xl font-semibold tracking-tight text-[var(--text)] sm:text-5xl">
                Tu dashboard de productividad, foco y ritmo sostenible.
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--text-muted)] sm:text-lg">
                Gestiona tareas, mide sesiones profundas, alterna descansos inteligentes y
                mantente motivado con una experiencia dinamica que recuerda todo en cada recarga.
              </p>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-1">
              <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                <div className="flex items-center gap-3">
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/18 text-violet-200">
                    <Target className="h-6 w-6" />
                  </div>
                  <div>
                    <p className="text-sm text-[var(--text-muted)]">Resumen rapido</p>
                    <p className="text-xl font-semibold text-[var(--text)]">
                      {activeTasksCount} tareas activas
                    </p>
                  </div>
                </div>
                <p className="mt-4 text-sm leading-6 text-[var(--text-muted)]">
                  {timerState.isRunning
                    ? `Temporizador activo en modo ${currentPreset.label}.`
                    : 'Listo para arrancar tu siguiente bloque de concentracion.'}
                </p>
              </div>

              <div className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-strong)] p-5">
                <div className="flex flex-wrap items-center gap-3">
                  {[
                    { id: 'system', label: 'Auto', icon: Sparkles },
                    { id: 'light', label: 'Claro', icon: Sun },
                    { id: 'dark', label: 'Oscuro', icon: Moon },
                  ].map(({ id, label, icon: Icon }) => {
                    const active = themeMode === id;

                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setThemeMode(id)}
                        className={`inline-flex items-center gap-2 rounded-2xl px-4 py-2 text-sm font-medium transition ${
                          active
                            ? 'bg-[var(--text)] text-[var(--bg)] shadow-lg'
                            : 'bg-[var(--surface)] text-[var(--text-muted)] hover:bg-[var(--surface-strong)]'
                        }`}
                      >
                        <Icon className="h-4 w-4" />
                        {label}
                      </button>
                    );
                  })}
                </div>
                <p className="mt-4 text-sm text-[var(--text-muted)]">
                  Tema actual: <span className="font-medium text-[var(--text)]">{resolvedTheme}</span>{' '}
                  · se detecta automaticamente desde tu sistema si eliges Auto.
                </p>
              </div>
            </div>
          </div>
        </motion.header>

        <div className="grid gap-6 xl:grid-cols-[1.08fr_0.92fr]">
          <div className="space-y-6">
            <motion.section
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 }}
              className="glass-panel rounded-[32px] p-6 sm:p-8"
            >
              <div className="flex flex-col gap-6">
                <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                  <div>
                    <p className="text-sm uppercase tracking-[0.24em] text-[var(--text-muted)]">
                      Pomodoro timer
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--text)] sm:text-3xl">
                      Mantente en flow con transiciones suaves.
                    </h2>
                  </div>
                  <div className="flex flex-wrap gap-3">
                    {Object.values(TIMER_PRESETS).map((preset) => {
                      const active = timerState.mode === preset.id;

                      return (
                        <button
                          key={preset.id}
                          type="button"
                          onClick={() => switchTimerMode(preset.id)}
                          className="rounded-2xl border px-4 py-3 text-left transition hover:-translate-y-0.5"
                          style={{
                            borderColor: active ? preset.accent : 'var(--border)',
                            background: active ? preset.accentSoft : 'var(--surface-strong)',
                            boxShadow: active ? `0 18px 38px ${preset.accentSoft}` : 'none',
                          }}
                        >
                          <p className="text-sm font-semibold text-[var(--text)]">{preset.label}</p>
                          <p className="text-xs text-[var(--text-muted)]">{preset.minutes} min</p>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid gap-8 lg:grid-cols-[1fr_0.9fr] lg:items-center">
                  <div className="flex justify-center">
                    <motion.div
                      key={timerState.mode}
                      initial={{ opacity: 0, scale: 0.96 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="relative flex h-[280px] w-[280px] items-center justify-center"
                    >
                      <svg viewBox="0 0 280 280" className="absolute inset-0">
                        <defs>
                          <linearGradient id="timerGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                            <stop offset="0%" stopColor={currentPreset.gradient[0]} />
                            <stop offset="100%" stopColor={currentPreset.gradient[1]} />
                          </linearGradient>
                        </defs>
                        <circle
                          cx="140"
                          cy="140"
                          r={ringRadius}
                          fill="none"
                          stroke="rgba(148, 163, 184, 0.16)"
                          strokeWidth="18"
                        />
                        <motion.circle
                          cx="140"
                          cy="140"
                          r={ringRadius}
                          fill="none"
                          stroke="url(#timerGradient)"
                          strokeWidth="18"
                          strokeLinecap="round"
                          strokeDasharray={ringCircumference}
                          initial={false}
                          animate={{ strokeDashoffset: ringOffset }}
                          transition={{ type: 'spring', stiffness: 80, damping: 18 }}
                          style={{
                            strokeDashoffset: ringCircumference,
                            transform: 'rotate(-90deg)',
                            transformOrigin: '50% 50%',
                            filter: `drop-shadow(0 10px 30px ${currentPreset.accentSoft})`,
                          }}
                        />
                      </svg>

                      <div className="glass-panel relative flex h-[200px] w-[200px] flex-col items-center justify-center rounded-full border border-white/10 bg-white/5 text-center">
                        <span className="rounded-full px-3 py-1 text-xs uppercase tracking-[0.24em] text-[var(--text-muted)]">
                          {currentPreset.label}
                        </span>
                        <motion.p
                          key={timerState.remainingSeconds}
                          initial={{ opacity: 0.6, y: 4 }}
                          animate={{ opacity: 1, y: 0 }}
                          className="mt-4 text-5xl font-semibold tracking-tight text-[var(--text)]"
                        >
                          {formatTime(timerState.remainingSeconds)}
                        </motion.p>
                        <p className="mt-3 text-sm text-[var(--text-muted)]">
                          {timerState.isRunning ? 'Sesion en curso' : 'Preparado para arrancar'}
                        </p>
                      </div>
                    </motion.div>
                  </div>

                  <div>
                    <AnimatePresence mode="wait">
                      <motion.div
                        key={currentPreset.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        className="rounded-[28px] border border-[var(--border)] bg-[var(--surface-strong)] p-6"
                      >
                        <p className="text-sm uppercase tracking-[0.2em] text-[var(--text-muted)]">
                          Estado actual
                        </p>
                        <h3 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                          {currentPreset.description}
                        </h3>
                        <p className="mt-4 text-sm leading-7 text-[var(--text-muted)]">
                          Alterna entre foco y descansos para mantener una energia estable durante
                          el dia. Todo el progreso del temporizador se guarda localmente.
                        </p>
                      </motion.div>
                    </AnimatePresence>

                    <div className="mt-5 flex flex-wrap gap-3">
                      <motion.button
                        whileTap={{ scale: 0.98 }}
                        type="button"
                        onClick={toggleTimer}
                        className="inline-flex items-center gap-3 rounded-2xl px-5 py-4 text-sm font-semibold text-white shadow-lg transition"
                        style={{ backgroundColor: currentPreset.accent }}
                      >
                        {timerState.isRunning ? (
                          <>
                            <Pause className="h-5 w-5" />
                            Pausar
                          </>
                        ) : (
                          <>
                            <Play className="h-5 w-5" />
                            Iniciar
                          </>
                        )}
                      </motion.button>

                      <button
                        type="button"
                        onClick={resetTimer}
                        className="inline-flex items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-5 py-4 text-sm font-semibold text-[var(--text)] transition hover:-translate-y-0.5"
                      >
                        <RotateCcw className="h-5 w-5" />
                        Reiniciar
                      </button>
                    </div>

                    <div className="mt-6 grid gap-4 sm:grid-cols-3">
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          Progreso
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                          {Math.round(progress * 100)}%
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          Sesiones
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                          {sessionHistory.length}
                        </p>
                      </div>
                      <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                        <p className="text-xs uppercase tracking-[0.18em] text-[var(--text-muted)]">
                          Tareas resueltas
                        </p>
                        <p className="mt-2 text-2xl font-semibold text-[var(--text)]">
                          {completedTasksCount}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </motion.section>

            <div className="grid gap-6 lg:grid-cols-[0.84fr_1.16fr]">
              <motion.section
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 }}
                className="glass-panel rounded-[32px] p-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Quotes widget
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                      Mantente motivado
                    </h2>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-violet-500/14 text-violet-200">
                    <Quote className="h-6 w-6" />
                  </div>
                </div>

                <AnimatePresence mode="wait">
                  <motion.blockquote
                    key={quoteIndex}
                    initial={{ opacity: 0, y: 18 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -18 }}
                    className="mt-6 rounded-[28px] border border-[var(--border)] bg-[var(--surface-strong)] p-6"
                  >
                    <p className="text-lg leading-8 text-[var(--text)]">"{currentQuote.text}"</p>
                    <footer className="mt-4 text-sm text-[var(--text-muted)]">
                      — {currentQuote.author}
                    </footer>
                  </motion.blockquote>
                </AnimatePresence>

                <div className="mt-6 flex items-center gap-2">
                  {QUOTES.map((quote, index) => (
                    <button
                      key={quote.author + index}
                      type="button"
                      onClick={() => setQuoteIndex(index)}
                      className={`h-2 rounded-full transition ${
                        index === quoteIndex % QUOTES.length
                          ? 'w-10 bg-violet-400'
                          : 'w-2 bg-slate-400/30'
                      }`}
                      aria-label={`Ir a la frase ${index + 1}`}
                    />
                  ))}
                </div>
                <p className="mt-4 text-sm text-[var(--text-muted)]">
                  Rotacion automatica cada 30 segundos.
                </p>
              </motion.section>

              <motion.section
                initial={{ opacity: 0, y: 22 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.14 }}
                className="glass-panel rounded-[32px] p-6"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-[var(--text-muted)]">
                      Estadisticas
                    </p>
                    <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                      Rendimiento semanal
                    </h2>
                  </div>
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/14 text-cyan-200">
                    <BarChart3 className="h-6 w-6" />
                  </div>
                </div>

                <div className="mt-6 grid gap-4 sm:grid-cols-2">
                  <StatCard
                    icon={Clock3}
                    label="Horas totales"
                    value={totalHoursLabel}
                    subtitle="acumuladas en sesiones focus"
                    accent="rgba(99, 102, 241, 0.92)"
                  />
                  <StatCard
                    icon={Target}
                    label="Sesiones"
                    value={sessionHistory.length}
                    subtitle="pomodoros completados"
                    accent="rgba(20, 184, 166, 0.92)"
                  />
                  <StatCard
                    icon={Sparkles}
                    label="Hoy"
                    value={`${todayMinutes} min`}
                    subtitle="focus registrado hoy"
                    accent="rgba(249, 115, 22, 0.92)"
                  />
                  <StatCard
                    icon={CheckCircle2}
                    label="Tareas completadas"
                    value={completedTasksCount}
                    subtitle="avance de tu backlog"
                    accent="rgba(236, 72, 153, 0.92)"
                  />
                </div>
              </motion.section>
            </div>

            <motion.section
              initial={{ opacity: 0, y: 22 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.18 }}
              className="glass-panel rounded-[32px] p-6"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="text-sm uppercase tracking-[0.2em] text-[var(--text-muted)]">
                    Grafico semanal
                  </p>
                  <h2 className="mt-2 text-2xl font-semibold text-[var(--text)]">
                    Vista interactiva de tus sesiones
                  </h2>
                </div>
                <p className="text-sm text-[var(--text-muted)]">
                  {weeklyFocusMinutes} min registrados en los ultimos 7 dias.
                </p>
              </div>

              <div className="mt-6 h-80 rounded-[28px] border border-[var(--border)] bg-[var(--surface-strong)] px-2 py-4">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={weeklyData}
                    margin={{ top: 10, right: 10, left: -12, bottom: 0 }}
                    onMouseMove={(eventState) => setHoveredDay(eventState?.activeTooltipIndex ?? null)}
                    onMouseLeave={() => setHoveredDay(null)}
                  >
                    <defs>
                      <linearGradient id="weeklyGradient" x1="0%" y1="0%" x2="0%" y2="100%">
                        <stop offset="0%" stopColor="#8b5cf6" />
                        <stop offset="100%" stopColor="#06b6d4" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke="var(--chart-grid)" strokeDasharray="4 4" vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tickFormatter={(value) => `${value}m`}
                      tick={{ fill: 'var(--text-muted)', fontSize: 12 }}
                      axisLine={false}
                      tickLine={false}
                      width={46}
                    />
                    <Tooltip content={<WeeklyTooltip />} cursor={{ fill: 'rgba(99, 102, 241, 0.08)' }} />
                    <Bar dataKey="minutes" radius={[18, 18, 6, 6]} animationDuration={500}>
                      {weeklyData.map((entry, index) => (
                        <Cell
                          key={entry.key}
                          fill={
                            hoveredDay === index
                              ? '#8b5cf6'
                              : entry.minutes > 0
                                ? 'url(#weeklyGradient)'
                                : 'rgba(148, 163, 184, 0.18)'
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </motion.section>
          </div>

          <motion.section
            initial={{ opacity: 0, y: 22 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="glass-panel rounded-[32px] p-6 sm:p-8"
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm uppercase tracking-[0.2em] text-[var(--text-muted)]">
                  Task manager
                </p>
                <h2 className="mt-2 text-3xl font-semibold text-[var(--text)]">
                  Tareas claras, prioridades visibles.
                </h2>
              </div>
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text-muted)]">
                {tasks.length} totales · {completedTasksCount} completadas
              </div>
            </div>

            <form onSubmit={handleTaskSubmit} className="mt-8 grid gap-4 md:grid-cols-[1.4fr_0.8fr_0.9fr_auto]">
              <label className="space-y-2 md:col-span-4 lg:col-span-1">
                <span className="text-sm text-[var(--text-muted)]">Nueva tarea</span>
                <input
                  type="text"
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  placeholder="Ej. Preparar propuesta para el cliente"
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-[var(--text)] outline-none transition placeholder:text-[var(--text-muted)] focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm text-[var(--text-muted)]">Prioridad</span>
                <select
                  value={taskPriority}
                  onChange={(event) => setTaskPriority(event.target.value)}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-[var(--text)] outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15"
                >
                  {TASK_PRIORITIES.map((priority) => (
                    <option key={priority} value={priority}>
                      {priority}
                    </option>
                  ))}
                </select>
              </label>

              <label className="space-y-2">
                <span className="text-sm text-[var(--text-muted)]">Categoria</span>
                <select
                  value={taskCategory}
                  onChange={(event) => setTaskCategory(event.target.value)}
                  className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-[var(--text)] outline-none transition focus:border-violet-400 focus:ring-4 focus:ring-violet-500/15"
                >
                  {TASK_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="submit"
                className="mt-7 inline-flex items-center justify-center gap-2 rounded-2xl bg-violet-500 px-5 py-3 font-semibold text-white shadow-lg transition hover:-translate-y-0.5"
              >
                <Plus className="h-5 w-5" />
                Crear
              </button>
            </form>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <div className="inline-flex items-center gap-2 rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] px-4 py-3 text-sm text-[var(--text-muted)]">
                <ListFilter className="h-4 w-4" />
                Filtros
              </div>
              {TASK_FILTERS.map((filter) => {
                const active = taskFilter === filter.id;
                const count =
                  filter.id === 'all'
                    ? tasks.length
                    : filter.id === 'active'
                      ? activeTasksCount
                      : completedTasksCount;

                return (
                  <button
                    key={filter.id}
                    type="button"
                    onClick={() => setTaskFilter(filter.id)}
                    className={`inline-flex items-center gap-2 rounded-2xl px-4 py-3 text-sm font-medium transition ${
                      active
                        ? 'bg-[var(--text)] text-[var(--bg)] shadow-lg'
                        : 'border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text-muted)] hover:-translate-y-0.5'
                    }`}
                  >
                    {filter.label}
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        active ? 'bg-black/15 text-white' : 'bg-white/6 text-[var(--text)]'
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="mt-8">
              <AnimatePresence mode="popLayout">
                {filteredTasks.length ? (
                  <motion.ul layout className="space-y-4">
                    {filteredTasks.map((task) => (
                      <motion.li
                        key={task.id}
                        layout
                        initial={{ opacity: 0, y: 18, scale: 0.98 }}
                        animate={{
                          opacity: 1,
                          y: 0,
                          scale: 1,
                          backgroundColor: task.completed
                            ? 'rgba(16, 185, 129, 0.08)'
                            : 'rgba(255, 255, 255, 0)',
                        }}
                        exit={{ opacity: 0, x: 28, scale: 0.96 }}
                        className="rounded-[28px] border border-[var(--border)] p-5 shadow-[0_14px_34px_rgba(15,23,42,0.08)]"
                      >
                        <div className="flex items-start gap-4">
                          <button
                            type="button"
                            onClick={() => toggleTask(task.id)}
                            className={`mt-1 flex h-10 w-10 items-center justify-center rounded-2xl border transition ${
                              task.completed
                                ? 'border-emerald-400/40 bg-emerald-500/15 text-emerald-200'
                                : 'border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text-muted)] hover:border-violet-400'
                            }`}
                            aria-label={`Marcar tarea ${task.title}`}
                          >
                            {task.completed ? (
                              <CheckCircle2 className="h-5 w-5" />
                            ) : (
                              <div className="h-3.5 w-3.5 rounded-full border border-current" />
                            )}
                          </button>

                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <h3
                                className={`text-lg font-semibold text-[var(--text)] ${
                                  task.completed ? 'line-through opacity-60' : ''
                                }`}
                              >
                                {task.title}
                              </h3>
                              <span
                                className="rounded-full border px-3 py-1 text-xs font-medium"
                                style={{
                                  color: PRIORITY_META[task.priority].color,
                                  backgroundColor: PRIORITY_META[task.priority].background,
                                  borderColor: PRIORITY_META[task.priority].border,
                                }}
                              >
                                {task.priority}
                              </span>
                              <span
                                className="rounded-full px-3 py-1 text-xs font-medium"
                                style={{
                                  color: CATEGORY_META[task.category].color,
                                  backgroundColor: CATEGORY_META[task.category].background,
                                }}
                              >
                                {task.category}
                              </span>
                            </div>
                            <p className="mt-3 text-sm text-[var(--text-muted)]">
                              Creada el {formatRelativeDate(task.createdAt)}
                            </p>
                          </div>

                          <button
                            type="button"
                            onClick={() => deleteTask(task.id)}
                            className="flex h-10 w-10 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--surface-strong)] text-[var(--text-muted)] transition hover:border-rose-400 hover:text-rose-300"
                            aria-label={`Eliminar tarea ${task.title}`}
                          >
                            <Trash2 className="h-5 w-5" />
                          </button>
                        </div>
                      </motion.li>
                    ))}
                  </motion.ul>
                ) : (
                  <motion.div
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="rounded-[32px] border border-dashed border-[var(--border)] bg-[var(--surface-strong)] px-6 py-14 text-center"
                  >
                    <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-3xl bg-violet-500/15 text-violet-200">
                      <ListTodo className="h-8 w-8" />
                    </div>
                    <h3 className="mt-5 text-xl font-semibold text-[var(--text)]">
                      No hay tareas en esta vista
                    </h3>
                    <p className="mx-auto mt-3 max-w-md text-sm leading-7 text-[var(--text-muted)]">
                      Crea una nueva tarea o cambia el filtro para ver tus elementos activos y
                      completados con transiciones animadas.
                    </p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.section>
        </div>
      </div>
    </div>
  );
}
