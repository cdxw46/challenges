import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Quote } from 'lucide-react';

const QUOTES = [
  { text: "The only way to do great work is to love what you do.", author: "Steve Jobs" },
  { text: "Don't watch the clock; do what it does. Keep going.", author: "Sam Levenson" },
  { text: "The future depends on what you do today.", author: "Mahatma Gandhi" },
  { text: "It always seems impossible until it's done.", author: "Nelson Mandela" },
  { text: "Start where you are. Use what you have. Do what you can.", author: "Arthur Ashe" },
  { text: "Focus on being productive instead of busy.", author: "Tim Ferriss" },
  { text: "Amateurs sit and wait for inspiration, the rest of us just get up and go to work.", author: "Stephen King" },
  { text: "You don't have to see the whole staircase, just take the first step.", author: "Martin Luther King Jr." },
  { text: "Action is the foundational key to all success.", author: "Pablo Picasso" },
  { text: "Productivity is never an accident. It is always the result of a commitment to excellence, intelligent planning, and focused effort.", author: "Paul J. Meyer" },
];

export function Quotes() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % QUOTES.length);
    }, 30000); // Rotate every 30 seconds

    return () => clearInterval(interval);
  }, []);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 relative overflow-hidden flex items-center justify-center min-h-[160px]">
      <Quote size={80} className="absolute -top-4 -left-4 text-muted/30 rotate-180" />
      
      <AnimatePresence mode="wait">
        <motion.div
          key={index}
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 0.5 }}
          className="text-center z-10 w-full max-w-md"
        >
          <p className="text-lg font-medium italic mb-3 text-foreground/90">
            "{QUOTES[index].text}"
          </p>
          <p className="text-sm text-muted-foreground font-semibold">
            — {QUOTES[index].author}
          </p>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
