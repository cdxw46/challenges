import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { Clock, Target, CalendarDays, CheckCircle2, BarChart3 } from 'lucide-react';

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];

function StatCard({ icon: Icon, label, value, color, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="bg-white dark:bg-surface-800/50 rounded-xl p-4 border border-surface-200 dark:border-surface-700"
    >
      <div className="flex items-center gap-3">
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center"
          style={{ backgroundColor: `${color}15` }}
        >
          <Icon className="w-5 h-5" style={{ color }} />
        </div>
        <div>
          <p className="text-2xl font-bold text-surface-800 dark:text-surface-100">{value}</p>
          <p className="text-xs text-surface-400">{label}</p>
        </div>
      </div>
    </motion.div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white dark:bg-surface-800 px-3 py-2 rounded-lg shadow-lg border border-surface-200 dark:border-surface-700">
      <p className="text-xs font-medium text-surface-500">{label}</p>
      <p className="text-sm font-bold text-primary-500">{payload[0].value} sesiones</p>
    </div>
  );
}

export default function Statistics({ sessions, tasks }) {
  const stats = useMemo(() => {
    const totalMinutes = sessions.reduce((acc, s) => acc + (s.duration || 25), 0);
    const totalHours = (totalMinutes / 60).toFixed(1);
    const totalSessions = sessions.length;

    const today = new Date().toDateString();
    const todaySessions = sessions.filter(s => new Date(s.date).toDateString() === today).length;
    const completedTasks = tasks.filter(t => t.completed).length;

    const now = new Date();
    const dayOfWeek = now.getDay();
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);

    const weekData = DAYS.map((day, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toDateString();
      const count = sessions.filter(s => new Date(s.date).toDateString() === dateStr).length;
      return { day, sessions: count };
    });

    return { totalHours, totalSessions, todaySessions, completedTasks, weekData };
  }, [sessions, tasks]);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="bg-white dark:bg-surface-900 rounded-2xl p-6 shadow-lg shadow-surface-200/50 dark:shadow-surface-900/50 border border-surface-200 dark:border-surface-800"
    >
      <div className="flex items-center gap-2 mb-6">
        <BarChart3 className="w-5 h-5 text-primary-500" />
        <h2 className="text-lg font-semibold text-surface-800 dark:text-surface-200">Estadísticas</h2>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <StatCard icon={Clock} label="Horas Totales" value={stats.totalHours} color="#3b82f6" delay={0.25} />
        <StatCard icon={Target} label="Sesiones" value={stats.totalSessions} color="#8b5cf6" delay={0.3} />
        <StatCard icon={CalendarDays} label="Hoy" value={stats.todaySessions} color="#10b981" delay={0.35} />
        <StatCard icon={CheckCircle2} label="Completadas" value={stats.completedTasks} color="#f59e0b" delay={0.4} />
      </div>

      {/* Weekly Chart */}
      <div className="bg-surface-50 dark:bg-surface-800/30 rounded-xl p-4">
        <p className="text-xs font-medium text-surface-400 mb-3">Sesiones esta semana</p>
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.weekData} barCategoryGap="20%">
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--color-surface-200)" />
              <XAxis
                dataKey="day"
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'transparent' }} />
              <Bar
                dataKey="sessions"
                fill="#3b82f6"
                radius={[6, 6, 0, 0]}
                maxBarSize={32}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </motion.div>
  );
}
