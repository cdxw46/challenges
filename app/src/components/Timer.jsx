import { motion, AnimatePresence } from 'framer-motion'
import { Play, Pause, RotateCcw, Coffee, Brain, Sunset } from 'lucide-react'
import { useTimer } from '../hooks/useTimer'

const modes = [
  { key: 'focus', label: 'Focus', icon: Brain, color: 'from-primary-500 to-primary-700' },
  { key: 'shortBreak', label: 'Short Break', icon: Coffee, color: 'from-emerald-400 to-emerald-600' },
  { key: 'longBreak', label: 'Long Break', icon: Sunset, color: 'from-accent-400 to-accent-600' },
]

function formatTime(seconds) {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`
}

export default function Timer() {
  const { mode, duration, remaining, isRunning, toggle, reset, setMode } = useTimer()
  const progress = duration > 0 ? (duration - remaining) / duration : 0
  const currentMode = modes.find((m) => m.key === mode) || modes[0]

  const circumference = 2 * Math.PI * 120
  const strokeDashoffset = circumference * (1 - progress)

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ delay: 0.1 }}
      className="bg-white dark:bg-gray-900 rounded-3xl p-8 shadow-xl shadow-gray-200/50 dark:shadow-black/20 border border-gray-100 dark:border-gray-800"
    >
      <div className="flex gap-2 mb-8 bg-gray-100 dark:bg-gray-800 rounded-2xl p-1.5">
        {modes.map((m) => (
          <button
            key={m.key}
            onClick={() => setMode(m.key)}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl text-sm font-medium transition-all cursor-pointer ${
              mode === m.key
                ? 'bg-white dark:bg-gray-700 shadow-md text-gray-900 dark:text-white'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <m.icon className="w-4 h-4" />
            <span className="hidden sm:inline">{m.label}</span>
          </button>
        ))}
      </div>

      <div className="relative w-64 h-64 mx-auto mb-8">
        <svg className="w-full h-full -rotate-90" viewBox="0 0 256 256">
          <circle
            cx="128"
            cy="128"
            r="120"
            fill="none"
            stroke="currentColor"
            strokeWidth="8"
            className="text-gray-100 dark:text-gray-800"
          />
          <motion.circle
            cx="128"
            cy="128"
            r="120"
            fill="none"
            strokeWidth="8"
            strokeLinecap="round"
            strokeDasharray={circumference}
            animate={{ strokeDashoffset }}
            transition={{ duration: 0.5, ease: 'easeInOut' }}
            className={`${
              mode === 'focus'
                ? 'stroke-primary-500'
                : mode === 'shortBreak'
                ? 'stroke-emerald-500'
                : 'stroke-accent-500'
            }`}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <AnimatePresence mode="wait">
            <motion.div
              key={remaining}
              initial={{ y: 5, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -5, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="text-6xl font-bold text-gray-900 dark:text-white tabular-nums tracking-tight"
            >
              {formatTime(remaining)}
            </motion.div>
          </AnimatePresence>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 font-medium capitalize">
            {currentMode.label}
          </p>
        </div>
      </div>

      <div className="flex items-center justify-center gap-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={reset}
          className="w-12 h-12 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors cursor-pointer"
        >
          <RotateCcw className="w-5 h-5" />
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={toggle}
          className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${currentMode.color} flex items-center justify-center text-white shadow-lg cursor-pointer ${
            mode === 'focus'
              ? 'shadow-primary-500/30'
              : mode === 'shortBreak'
              ? 'shadow-emerald-500/30'
              : 'shadow-accent-500/30'
          }`}
        >
          {isRunning ? (
            <Pause className="w-7 h-7" />
          ) : (
            <Play className="w-7 h-7 ml-1" />
          )}
        </motion.button>

        <div className="w-12 h-12" />
      </div>
    </motion.div>
  )
}
