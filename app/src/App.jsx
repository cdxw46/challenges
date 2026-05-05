import { AppProvider } from './context/AppContext'
import Header from './components/Header'
import Timer from './components/Timer'
import TaskList from './components/TaskList'
import StatsPanel from './components/StatsPanel'
import QuoteWidget from './components/QuoteWidget'

function Dashboard() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-950 transition-colors">
      <Header />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-5 space-y-6">
            <Timer />
            <QuoteWidget />
          </div>

          <div className="lg:col-span-7 space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 lg:grid-cols-1 xl:grid-cols-2">
              <div className="xl:col-span-1">
                <StatsPanel />
              </div>
              <div className="xl:col-span-1">
                <TaskList />
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="text-center py-6 text-xs text-gray-400 dark:text-gray-600">
        <p>Built with React + Tailwind CSS + Framer Motion</p>
      </footer>
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Dashboard />
    </AppProvider>
  )
}
