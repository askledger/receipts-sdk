import type { Config } from "tailwindcss";

export default {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: ["class", '[data-theme="dark"]'],
  theme: {
    extend: {
      colors: {
        brand: {
          navy: {
            900: "#0a1530",
            700: "#172547",
            500: "#2e4480",
          },
          gold: {
            500: "#c79b3c",
            300: "#e8c878",
          },
        },
        status: {
          allow: "#1b7f55",
          block: "#a32424",
          flag: "#b97607",
          pending: "#4a5d8a",
          info: "#1f5e9e",
          revoked: "#5a2a8c",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "SFMono-Regular", "monospace"],
      },
      fontVariantNumeric: {
        tnum: { "font-variant-numeric": "tabular-nums" },
      },
    },
  },
  plugins: [],
} satisfies Config;
