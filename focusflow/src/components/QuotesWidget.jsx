import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote } from 'lucide-react';
import { quotes } from '../utils/quotes';

export default function QuotesWidget() {
  const [index, setIndex] = useState(Math.floor(Math.random() * quotes.length));

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex(prev => (prev + 1) % quotes.length);
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  const current = quotes[index];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="bg-gradient-to-br from-primary-500 to-primary-700 dark:from-primary-800 dark:to-primary-950 rounded-2xl p-6 shadow-lg shadow-primary-500/20 dark:shadow-primary-900/30 text-white relative overflow-hidden"
    >
      <div className="absolute top-3 right-3 opacity-10">
        <Quote className="w-16 h-16" />
      </div>

      <div className="flex items-start gap-3 mb-3">
        <Quote className="w-5 h-5 flex-shrink-0 opacity-60 mt-0.5" />
        <AnimatePresence mode="wait">
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.4 }}
          >
            <p className="text-sm leading-relaxed font-medium italic">
              "{current.text}"
            </p>
            <p className="text-xs opacity-70 mt-2">— {current.author}</p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Progress dots */}
      <div className="flex justify-center gap-1 mt-4">
        {quotes.map((_, i) => (
          <button
            key={i}
            onClick={() => setIndex(i)}
            className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
              i === index ? 'bg-white w-4' : 'bg-white/30 hover:bg-white/50'
            }`}
          />
        ))}
      </div>
    </motion.div>
  );
}
