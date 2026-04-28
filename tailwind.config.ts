import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          primary: '#8B5E34',
          secondary: '#C7A46B',
          'light-gold': '#E7D2A6',
          'dark-brown': '#4A2F1B',
          cream: '#FAF7F0',
          card: '#FFFFFF',
          'text-primary': '#2B1A10',
          'text-secondary': '#6B4A2D',
          success: '#2E7D32',
          warning: '#F2A900',
          danger: '#C0392B',
          info: '#2563EB',
        },
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
