/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "var(--color-bg, #0d1017)",
        surface: "var(--color-surface, #151922)",
        border: "var(--color-border, #232838)",
        accent: {
          DEFAULT: "var(--color-accent, #ff9800)",
          dark: "var(--color-accent-dark, #e08600)",
          light: "var(--color-accent-light, #ffb74d)",
        },
        rarity: {
          common: "#9aa3b2",
          uncommon: "#4caf50",
          rare: "#2196f3",
          epic: "#9c27b0",
          legendary: "#ff9800",
        },
      },
      borderRadius: {
        card: "18px",
        btn: "14px",
      },
      boxShadow: {
        glow: "0 0 40px -10px rgba(255,152,0,0.45)",
        card: "0 8px 30px -10px rgba(0,0,0,0.6)",
      },
      backdropBlur: {
        glass: "16px",
      },
    },
  },
  plugins: [],
};
