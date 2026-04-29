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
          primary: '#8B5E3C',
          secondary: '#C6A77D',
          'light-gold': '#E7D5B8',
          'dark-brown': '#5C3A1E',
          cream: '#F8F6F3',
          card: '#FFFFFF',
          'text-primary': '#2B2B2B',
          'text-secondary': '#7A7A7A',
          border: '#E7E1D8',
          success: '#276749',
          warning: '#B45309',
          danger: '#BE3A2A',
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
