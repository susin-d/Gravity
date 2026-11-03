import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        canvas: "#09090b",
        panel: "#111113",
        raised: "#17171a",
        hover: "#1d1d21",
        line: {
          subtle: "#1f1f23",
          DEFAULT: "#27272a",
          strong: "#3f3f46",
        },
        ink: {
          DEFAULT: "#fafafa",
          muted: "#a1a1aa",
          dim: "#71717a",
        },
        danger: {
          DEFAULT: "#f43f5e",
          bg: "#2a0f16",
          border: "#7f1d2d",
          text: "#fda4af",
        },
        warning: {
          DEFAULT: "#f59e0b",
          bg: "#2a1d08",
          border: "#78350f",
          text: "#fcd34d",
        },
        success: {
          DEFAULT: "#10b981",
          bg: "#0b241b",
          border: "#065f46",
          text: "#6ee7b7",
        },
        info: {
          DEFAULT: "#38bdf8",
          bg: "#0c2230",
          border: "#075985",
          text: "#7dd3fc",
        },
        claude: {
          bg: "#2a1d08",
          border: "#78350f",
          text: "#fcd34d",
        },
        codex: {
          bg: "#0b241b",
          border: "#065f46",
          text: "#6ee7b7",
        },
      },
      borderColor: {
        DEFAULT: "#27272a",
      },
      borderRadius: {
        sm: "6px",
        DEFAULT: "8px",
        lg: "10px",
      },
      fontFamily: {
        sans: ['"Segoe UI Variable Text"', '"Segoe UI"', "system-ui", "sans-serif"],
        mono: ['"Cascadia Mono"', "Consolas", '"Courier New"', "monospace"],
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
    },
  },
  plugins: [],
} satisfies Config;
