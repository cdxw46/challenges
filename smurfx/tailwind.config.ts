import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        smurf: {
          50: "#f1f0fb",
          100: "#cecbf6",
          200: "#a8a3ee",
          300: "#827ce4",
          400: "#6b62d8",
          500: "#534ab7",
          600: "#3f3897",
          700: "#2e2978",
          800: "#1f1c5c",
          900: "#13113f"
        },
        ink: "#0a0a0a",
        paper: "#ffffff"
      },
      fontFamily: {
        display: ["var(--font-display)", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
        sans: ["var(--font-sans)", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"]
      },
      animation: {
        marquee: "marquee 30s linear infinite",
        "fade-up": "fadeUp 0.6s ease-out both",
        "shimmer": "shimmer 1.6s linear infinite"
      },
      keyframes: {
        marquee: {
          "0%": { transform: "translateX(0%)" },
          "100%": { transform: "translateX(-50%)" }
        },
        fadeUp: {
          "0%": { opacity: "0", transform: "translateY(16px)" },
          "100%": { opacity: "1", transform: "translateY(0)" }
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" }
        }
      }
    }
  },
  plugins: []
};

export default config;
