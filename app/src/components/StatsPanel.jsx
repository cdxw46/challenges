import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, CartesianGrid } from 'recharts'
import { TrendingUp, Clock, Flame, Award } from 'lucide-react'
import { useApp } from '../context/AppContext'

function getWeekData(sessions) {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const now = new Date()
  const weekStart = new Date(now)
  weekStart.setDate(now.getDate() - now.getDay())
  weekStart.setHours(0, 0, 0, 0)

  const counts = Array(7).fill(0)
  sessions.forEach((s) => {
    const d = new Date(s.completedAt)
    if (d >= weekStart) {
      counts[d.getDay()] += s.duration
    }
  })

  return days.map((day, i) => ({
    day,
    minutes: counts[i],
    isToday: i === now.getDay(),
  }))
}

function StatCard({ icon: Icon, label, value, color, delay }) {
  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay }}
      className="bg-white dark:bg-gray-900 rounded-2xl p-4 border border-gray-100 dark:border-gray-800 shadow-lg shadow-gray-200/30 dark:shadow-black/10"
    >
      <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${color} flex items-center justify-center mb-3`}>
        <Icon className="w-4.5 h-4.5 text-white" />
      </div>
      <p className="text-2xl font-bold text-gray-900 dark:text-white">{value}</p>
      <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{label}</p>
    </motion.div>
  )
}

const CustomTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    return (
      <div className="bg-gray-900 dark:bg-gray-700 text-white px-3 py-2 rounded-lg text-xs shadow-xl">
        <p className="font-medium">{payload[0].value} min</p>
      </div>
    )
  }
  return null
}

export default function StatsPanel() {
  const { state } = useApp()

  const weekData = useMemo(() => getWeekData(state.focusSessions), [state.focusSessions])

  const totalMinutes = state.focusSessions.reduce((sum, s) => sum + s.duration, 0)
  const totalHours = (totalMinutes / 60).toFixed(1)
  const streak = state.focusSessions.length

  const todaySessions = state.focusSessions.filter((s) => {
    const d = new Date(s.completedAt)
    const today = new Date()
    return d.toDateString() === today.toDateString()
  }).length

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.3 }}
      className="space-y-4"
    >
      <div className="grid grid-cols-2 gap-3">
        <StatCard
          icon={Clock}
          label="Total Hours"
          value={totalHours}
          color="from-primary-500 to-primary-600"
          delay={0.3}
        />
        <StatCard
          icon={Flame}
          label="Sessions"
          value={streak}
          color="from-rose-400 to-rose-500"
          delay={0.35}
        />
        <StatCard
          icon={TrendingUp}
          label="Today"
          value={todaySessions}
          color="from-emerald-400 to-emerald-500"
          delay={0.4}
        />
        <StatCard
          icon={Award}
          label="Tasks Done"
          value={state.tasks.filter((t) => t.completed).length}
          color="from-amber-400 to-amber-500"
          delay={0.45}
        />
      </div>

      <motion.div
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: 0.5 }}
        className="bg-white dark:bg-gray-900 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 shadow-lg shadow-gray-200/30 dark:shadow-black/10"
      >
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-4">
          Weekly Focus
        </h3>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weekData} barSize={28}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" className="dark:opacity-20" />
              <XAxis
                dataKey="day"
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#9ca3af' }}
              />
              <YAxis hide />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(0,0,0,0.04)' }} />
              <Bar
                dataKey="minutes"
                radius={[6, 6, 0, 0]}
                fill="url(#barGradient)"
              />
              <defs>
                <linearGradient id="barGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" />
                  <stop offset="100%" stopColor="#8b5cf6" />
                </linearGradient>
              </defs>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </motion.div>
  )
}
