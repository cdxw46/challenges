import { useEffect, useRef } from 'react'
import { useApp } from '../context/AppContext'

export function useTimer() {
  const { state, dispatch } = useApp()
  const { timer } = state
  const intervalRef = useRef(null)

  useEffect(() => {
    if (timer.isRunning && timer.remaining > 0) {
      intervalRef.current = setInterval(() => {
        dispatch({ type: 'TIMER_TICK' })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [timer.isRunning, timer.remaining, dispatch])

  useEffect(() => {
    if (timer.remaining === 0 && timer.isRunning) {
      dispatch({ type: 'TIMER_TOGGLE' })
      if (timer.mode === 'focus') {
        dispatch({ type: 'COMPLETE_SESSION' })
        try {
          new Audio('data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbsGczHjqIrNHfemEtOIOk0NyFZjJFhqLG0IxtO0iHoMbOjG46R4Whxs+NbjpHhaHGz41uOkeFocbPjW46R4Whxs+NbjpHhaHGz41uOkeFocbPjW46').play().catch(() => {})
        } catch {}
      } else {
        dispatch({ type: 'COMPLETE_BREAK' })
      }
    }
  }, [timer.remaining, timer.isRunning, timer.mode, dispatch])

  return {
    ...timer,
    toggle: () => dispatch({ type: 'TIMER_TOGGLE' }),
    reset: () => dispatch({ type: 'TIMER_RESET' }),
    setMode: (mode) => dispatch({ type: 'TIMER_SET_MODE', payload: mode }),
  }
}
