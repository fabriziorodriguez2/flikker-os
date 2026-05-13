import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-manrope)", "Manrope", "sans-serif"],
        body: ["var(--font-manrope)", "Manrope", "sans-serif"],
        display: ["var(--font-syne)", "Syne", "sans-serif"],
      },
      colors: {
        primary: "#5C6BC0",
        background: "#F5F6FA",
        surface: "#FFFFFF",
        border: "#E8EAF0",
        dark: "#0D1B2A",
        muted: "#8891A4",
        accent: "#FFAB76",
        success: "#639922",
        danger: "#C0392B",
      },
    },
  },
};

export default config;
