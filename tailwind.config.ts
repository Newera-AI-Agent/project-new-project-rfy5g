import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: {
          50: "#f6f7f9",
          100: "#eceef2",
          200: "#d5d9e2",
          300: "#b0b8c8",
          400: "#8591a8",
          500: "#66728d",
          600: "#515b74",
          700: "#424a5e",
          800: "#393f4f",
          900: "#333845",
          950: "#1b1e26",
        },
        accent: {
          DEFAULT: "#3b82f6",
          soft: "#60a5fa",
          deep: "#1d4ed8",
        },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
      },
      boxShadow: {
        panel: "0 1px 2px rgba(16,24,40,.06), 0 8px 24px -12px rgba(16,24,40,.24)",
      },
    },
  },
  plugins: [],
};

export default config;