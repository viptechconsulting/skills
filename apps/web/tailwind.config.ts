import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#f2f7ff",
          100: "#e1ebff",
          500: "#3d63dd",
          600: "#2f4fc4",
          700: "#25409e",
        },
      },
    },
  },
  plugins: [],
};

export default config;
