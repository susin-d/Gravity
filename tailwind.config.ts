import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        // ── Pure anchors ──────────────────────────────────────────────────
        white: "#ffffff",
        black: "#000000",

        // ── Glass surfaces (dark glass on near-black body) ─────────────────
        glass: {
          0: "rgba(5,5,5,0.75)",            // sidebar — deep frosted
          1: "rgba(255,255,255,0.03)",      // subtle tint
          2: "rgba(255,255,255,0.05)",      // card / panel
          3: "rgba(255,255,255,0.09)",      // elevated card / modal
          4: "rgba(255,255,255,0.13)",      // hover / pressed
        },

        // ── Ink (white with varying opacity — text / icon) ─────────────────
        ink: {
          full:   "#ffffff",
          high:   "rgba(255,255,255,0.85)",
          mid:    "rgba(255,255,255,0.55)",
          low:    "rgba(255,255,255,0.32)",
          faint:  "rgba(255,255,255,0.16)",
          ghost:  "rgba(255,255,255,0.08)",
        },

        // ── Edge (white borders) ───────────────────────────────────────────
        edge: {
          subtle:  "rgba(255,255,255,0.08)",
          DEFAULT: "rgba(255,255,255,0.13)",
          strong:  "rgba(255,255,255,0.22)",
        },
      },

      fontFamily: {
        sans: ["Inter", "Segoe UI", "system-ui", "-apple-system", "sans-serif"],
        mono: ["JetBrains Mono", "Cascadia Code", "Consolas", "monospace"],
      },

      fontSize: {
        "2xs": ["0.65rem",   { lineHeight: "1rem"     }],
        xs:    ["0.75rem",   { lineHeight: "1.125rem" }],
        sm:    ["0.8125rem", { lineHeight: "1.25rem"  }],
        base:  ["0.875rem",  { lineHeight: "1.5rem"   }],
        lg:    ["1rem",      { lineHeight: "1.5rem"   }],
        xl:    ["1.125rem",  { lineHeight: "1.75rem"  }],
        "2xl": ["1.25rem",   { lineHeight: "1.75rem"  }],
      },

      borderRadius: {
        DEFAULT: "6px",
        sm:  "4px",
        md:  "8px",
        lg:  "10px",
        xl:  "12px",
        "2xl": "16px",
      },

      backdropBlur: {
        xs: "2px",
        sm: "4px",
        md: "12px",
        lg: "16px",
        xl: "24px",
        "2xl": "40px",
      },

      boxShadow: {
        "glow-sm":  "0 0 12px rgba(255,255,255,0.10)",
        "glow-md":  "0 0 20px rgba(255,255,255,0.14)",
        "glow-lg":  "0 0 32px rgba(255,255,255,0.18)",
        "glow-dot": "0 0 6px rgba(255,255,255,0.80)",
        "glass":    "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 32px rgba(0,0,0,0.60)",
        "glass-lg": "0 1px 0 rgba(255,255,255,0.05) inset, 0 16px 48px rgba(0,0,0,0.75)",
      },

      keyframes: {
        "fade-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to:   { opacity: "1", transform: "translateY(0)"   },
        },
        shimmer: {
          from: { backgroundPosition: "-200% 0" },
          to:   { backgroundPosition:  "200% 0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 12px rgba(255,255,255,0.10)" },
          "50%":      { boxShadow: "0 0 24px rgba(255,255,255,0.22)" },
        },
      },

      animation: {
        "fade-up":    "fade-up 180ms cubic-bezier(0.22, 1, 0.36, 1) both",
        shimmer:      "shimmer 1.6s ease infinite",
        "glow-pulse": "glow-pulse 2s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
