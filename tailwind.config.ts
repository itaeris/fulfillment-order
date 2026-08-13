import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          50: "#FBF8F5",
          100: "#F5EFE8",
          200: "#E8DDD3",
          300: "#D4C4B5",
          400: "#A8917E",
          500: "#7A4232",
          600: "#6B3A2A",
          700: "#5C2E1E",
          800: "#3D2319",
          900: "#2C1810",
        },
        cream: {
          50: "#FDFCFA",
          100: "#FAF7F4",
          200: "#F5F0EB",
          300: "#EDE5DC",
        },
        shopee: {
          50: "#fff5f2",
          100: "#ffe6df",
          500: "#ee4d2d",
          600: "#d73211",
        },
        tiktok: {
          50: "#f0fefe",
          100: "#d9fbfc",
          500: "#00f2ea",
          600: "#00d4cd",
        },
        tokopedia: {
          50: "#f0fdf4",
          100: "#dcfce7",
          500: "#03ac0e",
          600: "#029a0c",
        },
      },
    },
  },
  plugins: [],
};
export default config;
