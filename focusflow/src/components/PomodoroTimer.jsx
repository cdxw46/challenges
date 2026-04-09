import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Play, Pause, RotateCcw, Coffee, Brain, Sunset } from 'lucide-react';

const MODES = {
  focus: { label: 'Focus', duration: 25 * 60, color: '#3b82f6', icon: Brain },
  shortBreak: { label: 'Short Break', duration: 5 * 60, color: '#10b981', icon: Coffee },
  longBreak: { label: 'Long Break', duration: 15 * 60, color: '#8b5cf6', icon: Sunset },
};

const RADIUS = 120;
const STROKE = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function PomodoroTimer({ onSessionComplete }) {
  const [mode, setMode] = useState('focus');
  const [timeLeft, setTimeLeft] = useState(MODES.focus.duration);
  const [isRunning, setIsRunning] = useState(false);
  const intervalRef = useRef(null);
  const startTimeRef = useRef(null);
  const pausedTimeRef = useRef(null);

  const currentMode = MODES[mode];
  const progress = 1 - timeLeft / currentMode.duration;
  const dashOffset = CIRCUMFERENCE * (1 - progress);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const startTimer = useCallback(() => {
    clearTimer();
    startTimeRef.current = Date.now() - ((currentMode.duration - timeLeft) * 1000);
    intervalRef.current = setInterval(() => {
      const elapsed = Math.floor((Date.now() - startTimeRef.current) / 1000);
      const remaining = currentMode.duration - elapsed;
      if (remaining <= 0) {
        clearTimer();
        setTimeLeft(0);
        setIsRunning(false);
        if (mode === 'focus') {
          onSessionComplete?.();
        }
      } else {
        setTimeLeft(remaining);
      }
    }, 200);
  }, [clearTimer, currentMode.duration, timeLeft, mode, onSessionComplete]);

  useEffect(() => {
    if (isRunning) {
      startTimer();
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [isRunning, startTimer, clearTimer]);

  const handleModeChange = (newMode) => {
    clearTimer();
    setIsRunning(false);
    setMode(newMode);
    setTimeLeft(MODES[newMode].duration);
  };

  const handleReset = () => {
    clearTimer();
    setIsRunning(false);
    setTimeLeft(currentMode.duration);
  };

  const toggleTimer = () => {
    setIsRunning(prev => !prev);
  };

  const ModeIcon = currentMode.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white dark:bg-surface-900 rounded-2xl p-6 shadow-lg shadow-surface-200/50 dark:shadow-surface-900/50 border border-surface-200 dark:border-surface-800"
    >
      <div className="flex items-center gap-2 mb-6">
        <ModeIcon className="w-5 h-5" style={{ color: currentMode.color }} />
        <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200">Pomodoro Timer</h2>
      </div>

      {/* Mode Tabs */}
      <div className="flex gap-2 mb-8 bg-surface-100 dark:bg-surface-800 rounded-xl p-1">
        {Object.entries(MODES).map(([key, m]) => (
          <button
            key={key}
            onClick={() => handleModeChange(key)}
            className={`relative flex-1 py-2 px-3 rounded-lg text-sm font-medium transition-colors duration-200 ${
              mode === key
                ? 'text-white'
                : 'text-surface-500 hover:text-surface-700 dark:hover:text-surface-300'
            }`}
          >
            {mode === key && (
              <motion.div
                layoutId="modeTab"
                className="absolute inset-0 rounded-lg"
                style={{ backgroundColor: m.color }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
            <span className="relative z-10">{m.label}</span>
          </button>
        ))}
      </div>

      {/* Timer Ring */}
      <div className="flex justify-center mb-8">
        <div className="relative">
          <svg width={RADIUS * 2 + STROKE * 2} height={RADIUS * 2 + STROKE * 2} className="transform -rotate-90">
            {/* Background ring */}
            <circle
              cx={RADIUS + STROKE}
              cy={RADIUS + STROKE}
              r={RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth={STROKE}
              className="text-surface-100 dark:text-surface-800"
            />
            {/* Progress ring */}
            <motion.circle
              cx={RADIUS + STROKE}
              cy={RADIUS + STROKE}
              r={RADIUS}
              fill="none"
              stroke={currentMode.color}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              initial={false}
              animate={{ strokeDashoffset: dashOffset }}
              transition={{ duration: 0.3, ease: 'easeInOut' }}
            />
          </svg>

          {/* Timer Display */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={`${minutes}-${seconds}`}
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="text-5xl font-bold tabular-nums text-surface-800 dark:text-surface-100"
              >
                {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
              </motion.div>
            </AnimatePresence>
            <p className="text-sm text-surface-400 mt-1">{currentMode.label}</p>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex justify-center gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleReset}
          className="p-3 rounded-xl bg-surface-100 dark:bg-surface-800 text-surface-500 hover:text-surface-700 dark:hover:text-surface-300 transition-colors"
        >
          <RotateCcw className="w-5 h-5" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggleTimer}
          className="px-8 py-3 rounded-xl text-white font-semibold shadow-lg transition-shadow hover:shadow-xl"
          style={{ backgroundColor: currentMode.color }}
        >
          <div className="flex items-center gap-2">
            {isRunning ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
            {isRunning ? 'Pause' : 'Start'}
          </div>
        </motion.button>

        <div className="w-11" /> {/* Spacer for symmetry */}
      </div>
    </motion.div>
  );
}
