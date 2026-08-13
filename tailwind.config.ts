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
