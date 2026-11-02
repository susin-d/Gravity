import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        gravity: {
          50:  "#eef2ff",
          100: "#e0e7ff",
          200: "#c7d2fe",
          300: "#a5b4fc",
          400: "#818cf8",
          500: "#6366f1",
          600: "#4f46e5",
          700: "#4338ca",
          800: "#3730a3",
          900: "#312e81",
          950: "#1e1b4b",
        },
        surface: {
          0:   "#09090b",  // body bg
          1:   "#0f0f12",  // sidebar
          2:   "#141418",  // card / panel
          3:   "#1c1c22",  // elevated card
          4:   "#242429",  // hover states
        },
        border: {
          subtle: "#27272a",
          DEFAULT: "#3f3f46",
          strong: "#52525b",
        },
        text: {
          primary:   "#f4f4f5",
          secondary: "#a1a1aa",
          tertiary:  "#71717a",
          disabled:  "#52525b",
          link:      "#818cf8",
        },
      },
      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
      },
      fontSize: {
        "2xs": ["0.65rem",  { lineHeight: "1rem"  }],
        xs:    ["0.75rem",  { lineHeight: "1.125rem" }],
        sm:    ["0.8125rem",{ lineHeight: "1.25rem" }],
        base:  ["0.875rem", { lineHeight: "1.5rem" }],
        lg:    ["1rem",     { lineHeight: "1.5rem" }],
        xl:    ["1.125rem", { lineHeight: "1.75rem" }],
        "2xl": ["1.25rem",  { lineHeight: "1.75rem" }],
      },
      borderRadius: {
        DEFAULT: "6px",
        sm: "4px",
        md: "8px",
        lg: "10px",
        xl: "12px",
      },
      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to:   { backgroundPosition: "200% 0" },
        },
      },
      animation: {
        "fade-up": "fade-up 180ms cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer:   "shimmer 1.6s ease infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
