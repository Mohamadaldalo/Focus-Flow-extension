/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // All colours reference CSS variables so dark/light switches instantly
        ink:              "var(--ink)",
        surface:          "var(--surface)",
        "surface-raised": "var(--surface-raised)",
        "surface-line":   "var(--surface-line)",
        paper:            "var(--paper)",
        muted:            "var(--muted)",

        // NEU brand colours — same in both modes
        blue: {
          DEFAULT: "var(--blue)",
          dim:     "var(--blue-dim)",
          glow:    "var(--blue-glow)",
        },
        red: {
          DEFAULT: "#C8102E",
          dim:     "#9B0D24",
        },
        gold: {
          DEFAULT: "#D4A017",
          dim:     "#A87D12",
        },
      },
      fontFamily: {
        display: ["Fraunces", "ui-serif", "Georgia", "serif"],
        sans:    ["Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        mono:    ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      boxShadow: {
        glow: "0 0 40px -8px rgba(74, 143, 231, 0.35)",
      },
    },
  },
  plugins: [],
};