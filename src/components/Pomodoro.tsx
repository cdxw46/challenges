import { useState, useEffect, useCallback } from 'react';
import { Play, Pause, RotateCcw } from 'lucide-react';
import { motion } from 'framer-motion';

type Mode = 'focus' | 'shortBreak' | 'longBreak';

const MODES: Record<Mode, { label: string; time: number; color: string }> = {
  focus: { label: 'Focus', time: 25 * 60, color: 'text-red-500' },
  shortBreak: { label: 'Short Break', time: 5 * 60, color: 'text-blue-500' },
  longBreak: { label: 'Long Break', time: 15 * 60, color: 'text-green-500' },
};

export function Pomodoro({ onComplete }: { onComplete: (mode: Mode) => void }) {
  const [mode, setMode] = useState<Mode>('focus');
  const [timeLeft, setTimeLeft] = useState(MODES.focus.time);
  const [isActive, setIsActive] = useState(false);

  useEffect(() => {
    let interval: number | undefined;

    if (isActive && timeLeft > 0) {
      interval = window.setInterval(() => {
        setTimeLeft((time) => time - 1);
      }, 1000);
    } else if (isActive && timeLeft === 0) {
      setIsActive(false);
      onComplete(mode);
      // Auto-switch logic could go here
    }

    return () => clearInterval(interval);
  }, [isActive, timeLeft, mode, onComplete]);

  const toggleTimer = () => setIsActive(!isActive);

  const resetTimer = useCallback(() => {
    setIsActive(false);
    setTimeLeft(MODES[mode].time);
  }, [mode]);

  const changeMode = (newMode: Mode) => {
    setMode(newMode);
    setIsActive(false);
    setTimeLeft(MODES[newMode].time);
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const progress = ((MODES[mode].time - timeLeft) / MODES[mode].time) * 100;
  const strokeDasharray = 283; // 2 * pi * r (r=45)
  const strokeDashoffset = strokeDasharray - (progress / 100) * strokeDasharray;

  return (
    <div className="bg-card rounded-xl p-6 shadow-sm border border-border flex flex-col items-center">
      <div className="flex gap-2 mb-6 bg-muted p-1 rounded-lg">
        {(Object.keys(MODES) as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => changeMode(m)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              mode === m ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {MODES[m].label}
          </button>
        ))}
      </div>

      <div className="relative w-48 h-48 mb-6 flex items-center justify-center">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
          <circle
            className="text-muted stroke-current"
            strokeWidth="4"
            cx="50"
            cy="50"
            r="45"
            fill="transparent"
          />
          <motion.circle
            className={`${MODES[mode].color} stroke-current`}
            strokeWidth="4"
            strokeLinecap="round"
            cx="50"
            cy="50"
            r="45"
            fill="transparent"
            initial={{ strokeDashoffset: strokeDasharray }}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.5, ease: "linear" }}
            style={{ strokeDasharray }}
          />
        </svg>
        <div className="absolute text-4xl font-bold font-mono tracking-tighter">
          {formatTime(timeLeft)}
        </div>
      </div>

      <div className="flex gap-4">
        <button
          onClick={toggleTimer}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {isActive ? <Pause size={24} /> : <Play size={24} className="ml-1" />}
        </button>
        <button
          onClick={resetTimer}
          className="w-12 h-12 flex items-center justify-center rounded-full bg-secondary text-secondary-foreground hover:bg-secondary/80 transition-colors"
        >
          <RotateCcw size={20} />
        </button>
      </div>
    </div>
  );
}
