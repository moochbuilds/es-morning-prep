import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Surfaces. NOTE: because a colour is named "base", `text-base` also
        // sets the text colour to the page background — use `text-[15px]`
        // (or another explicit size) for 16px-ish text, never `text-base`.
        base: "#0B0D10",
        surface: "#13161B",
        "surface-2": "#181C22",
        line: "#242931",
        "line-soft": "#1D222A",
        // Text
        ink: "#E7EAF0",
        "ink-2": "#A7AEBB",
        "ink-3": "#6E7683",
        // Semantic (interpretation, not sign)
        pos: "#3FB950",
        "pos-dim": "#1E3A24",
        neg: "#F0564A",
        "neg-dim": "#3B1D1B",
        warn: "#D9A02B",
        "warn-dim": "#3A2E12",
        neutral: "#8B93A1",
        "neutral-dim": "#22262D",
      },
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "Segoe UI", "sans-serif"],
        mono: [
          "ui-monospace",
          "SFMono-Regular",
          "JetBrains Mono",
          "Cascadia Mono",
          "Consolas",
          "monospace",
        ],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      borderRadius: {
        card: "10px",
      },
    },
  },
  plugins: [],
};

export default config;
