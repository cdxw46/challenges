import { createContext, useContext, useReducer, useEffect } from 'react'
import { v4 as uuidv4 } from 'uuid'

const AppContext = createContext()

const STORAGE_KEY = 'focusflow-data'

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) {
      const parsed = JSON.parse(raw)
      return {
        ...initialState,
        ...parsed,
        timer: { ...initialState.timer },
      }
    }
  } catch {}
  return initialState
}

function saveState(state) {
  const { timer, ...rest } = state
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rest))
}

const initialState = {
  darkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
  tasks: [],
  focusSessions: [],
  timer: {
    mode: 'focus',
    duration: 25 * 60,
    remaining: 25 * 60,
    isRunning: false,
  },
  settings: {
    focusDuration: 25,
    shortBreak: 5,
    longBreak: 15,
    sessionsBeforeLong: 4,
  },
  sessionCount: 0,
}

function reducer(state, action) {
  switch (action.type) {
    case 'TOGGLE_DARK_MODE':
      return { ...state, darkMode: !state.darkMode }

    case 'ADD_TASK':
      return {
        ...state,
        tasks: [
          ...state.tasks,
          {
            id: uuidv4(),
            text: action.payload,
            completed: false,
            createdAt: Date.now(),
            priority: action.priority || 'medium',
            category: action.category || 'general',
          },
        ],
      }

    case 'TOGGLE_TASK':
      return {
        ...state,
        tasks: state.tasks.map((t) =>
          t.id === action.payload ? { ...t, completed: !t.completed } : t
        ),
      }

    case 'DELETE_TASK':
      return {
        ...state,
        tasks: state.tasks.filter((t) => t.id !== action.payload),
      }

    case 'TIMER_TICK':
      if (state.timer.remaining <= 0) {
        return state
      }
      return {
        ...state,
        timer: {
          ...state.timer,
          remaining: state.timer.remaining - 1,
        },
      }

    case 'TIMER_TOGGLE':
      return {
        ...state,
        timer: { ...state.timer, isRunning: !state.timer.isRunning },
      }

    case 'TIMER_RESET': {
      const dur = getDuration(state.timer.mode, state.settings)
      return {
        ...state,
        timer: {
          ...state.timer,
          remaining: dur,
          duration: dur,
          isRunning: false,
        },
      }
    }

    case 'TIMER_SET_MODE': {
      const dur = getDuration(action.payload, state.settings)
      return {
        ...state,
        timer: {
          mode: action.payload,
          duration: dur,
          remaining: dur,
          isRunning: false,
        },
      }
    }

    case 'COMPLETE_SESSION': {
      const newCount = state.sessionCount + 1
      const isLongBreak =
        newCount % state.settings.sessionsBeforeLong === 0
      const nextMode = isLongBreak ? 'longBreak' : 'shortBreak'
      const dur = getDuration(nextMode, state.settings)
      return {
        ...state,
        sessionCount: newCount,
        focusSessions: [
          ...state.focusSessions,
          {
            id: uuidv4(),
            completedAt: Date.now(),
            duration: state.settings.focusDuration,
          },
        ],
        timer: {
          mode: nextMode,
          duration: dur,
          remaining: dur,
          isRunning: false,
        },
      }
    }

    case 'COMPLETE_BREAK': {
      const dur = getDuration('focus', state.settings)
      return {
        ...state,
        timer: {
          mode: 'focus',
          duration: dur,
          remaining: dur,
          isRunning: false,
        },
      }
    }

    default:
      return state
  }
}

function getDuration(mode, settings) {
  switch (mode) {
    case 'focus':
      return settings.focusDuration * 60
    case 'shortBreak':
      return settings.shortBreak * 60
    case 'longBreak':
      return settings.longBreak * 60
    default:
      return 25 * 60
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState)

  useEffect(() => {
    saveState(state)
  }, [state.tasks, state.focusSessions, state.darkMode, state.sessionCount])

  useEffect(() => {
    document.documentElement.classList.toggle('dark', state.darkMode)
  }, [state.darkMode])

  return (
    <AppContext.Provider value={{ state, dispatch }}>
      {children}
    </AppContext.Provider>
  )
}

export function useApp() {
  const ctx = useContext(AppContext)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
