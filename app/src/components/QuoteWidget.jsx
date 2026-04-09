import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Quote, RefreshCw } from 'lucide-react'

const quotes = [
  { text: "The secret of getting ahead is getting started.", author: "Mark Twain" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "It's not that I'm so smart, it's just that I stay with problems longer.", author: "Albert Einstein" },
  { text: "The way to get started is to quit talking and begin doing.", author: "Walt Disney" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "You don't have to be great to start, but you have to start to be great.", author: "Zig Ziglar" },
  { text: "Amateurs sit and wait for inspiration, the rest of us just get up and go to work.", author: "Stephen King" },
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "Success is the sum of small efforts, repeated day in and day out.", author: "Robert Collier" },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "Well done is better than well said.", author: "Benjamin Franklin" },
]

export default function QuoteWidget() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * quotes.length))

  useEffect(() => {
    const timer = setInterval(() => {
      setIndex((i) => (i + 1) % quotes.length)
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  const shuffle = () => {
    let next
    do {
      next = Math.floor(Math.random() * quotes.length)
    } while (next === index)
    setIndex(next)
  }

  return (
    <motion.div
      initial={{ y: 20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ delay: 0.6 }}
      className="bg-gradient-to-br from-primary-500/5 via-accent-500/5 to-rose-500/5 dark:from-primary-500/10 dark:via-accent-500/10 dark:to-rose-500/10 rounded-2xl p-5 border border-gray-100 dark:border-gray-800"
    >
      <div className="flex items-start justify-between mb-3">
        <Quote className="w-5 h-5 text-primary-500/60" />
        <motion.button
          whileHover={{ rotate: 180 }}
          whileTap={{ scale: 0.9 }}
          onClick={shuffle}
          className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-primary-500 hover:bg-white/60 dark:hover:bg-gray-800/60 transition-all cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </motion.button>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.3 }}
        >
          <p className="text-sm text-gray-700 dark:text-gray-300 leading-relaxed italic mb-2">
            "{quotes[index].text}"
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
            — {quotes[index].author}
          </p>
        </motion.div>
      </AnimatePresence>
    </motion.div>
  )
}
