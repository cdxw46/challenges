import { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Clock, CheckCircle, Target, Zap } from 'lucide-react';

export interface DailyStats {
  date: string;
  focusMinutes: number;
  tasksCompleted: number;
}

export function Statistics({ stats }: { stats: DailyStats[] }) {
  const today = new Date().toISOString().split('T')[0];
  
  const todayStats = stats.find(s => s.date === today) || { focusMinutes: 0, tasksCompleted: 0 };
  
  const totalFocusMinutes = stats.reduce((acc, curr) => acc + curr.focusMinutes, 0);
  const totalTasks = stats.reduce((acc, curr) => acc + curr.tasksCompleted, 0);
  const totalSessions = Math.floor(totalFocusMinutes / 25); // Approximate

  const chartData = useMemo(() => {
    const last7Days = Array.from({ length: 7 }).map((_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (6 - i));
      const dateStr = d.toISOString().split('T')[0];
      const dayStats = stats.find(s => s.date === dateStr);
      return {
        name: d.toLocaleDateString('en-US', { weekday: 'short' }),
        focusMinutes: dayStats?.focusMinutes || 0,
        isToday: i === 6
      };
    });
    return last7Days;
  }, [stats]);

  const cards = [
    {
      title: 'Total Focus',
      value: `${Math.floor(totalFocusMinutes / 60)}h ${totalFocusMinutes % 60}m`,
      icon: <Clock size={20} className="text-blue-500" />,
      bg: 'bg-blue-500/10'
    },
    {
      title: 'Sessions',
      value: totalSessions.toString(),
      icon: <Target size={20} className="text-purple-500" />,
      bg: 'bg-purple-500/10'
    },
    {
      title: 'Today',
      value: `${Math.floor(todayStats.focusMinutes / 60)}h ${todayStats.focusMinutes % 60}m`,
      icon: <Zap size={20} className="text-yellow-500" />,
      bg: 'bg-yellow-500/10'
    },
    {
      title: 'Tasks Done',
      value: totalTasks.toString(),
      icon: <CheckCircle size={20} className="text-green-500" />,
      bg: 'bg-green-500/10'
    }
  ];

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-semibold">Statistics</h2>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card, i) => (
          <div key={i} className="p-4 rounded-lg border border-border bg-background flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <div className={`p-2 rounded-md ${card.bg}`}>
                {card.icon}
              </div>
              <span className="text-sm text-muted-foreground font-medium">{card.title}</span>
            </div>
            <span className="text-2xl font-bold">{card.value}</span>
          </div>
        ))}
      </div>

      <div className="h-[250px] w-full mt-4">
        <h3 className="text-sm font-medium text-muted-foreground mb-4">Focus Time (Last 7 Days)</h3>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis 
              dataKey="name" 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.5 }} 
              dy={10}
            />
            <YAxis 
              axisLine={false} 
              tickLine={false} 
              tick={{ fill: 'currentColor', fontSize: 12, opacity: 0.5 }}
            />
            <Tooltip 
              cursor={{ fill: 'var(--color-muted)', opacity: 0.4 }}
              contentStyle={{ 
                backgroundColor: 'var(--color-background)', 
                borderColor: 'var(--color-border)',
                borderRadius: '8px',
                color: 'var(--color-foreground)'
              }}
              itemStyle={{ color: 'var(--color-foreground)' }}
            />
            <Bar dataKey="focusMinutes" radius={[4, 4, 0, 0]}>
              {chartData.map((entry, index) => (
                <Cell 
                  key={`cell-${index}`} 
                  fill={entry.isToday ? 'var(--color-primary)' : 'var(--color-muted-foreground)'} 
                  fillOpacity={entry.isToday ? 1 : 0.3}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
