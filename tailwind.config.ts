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
          primary:       '#8B5E34',
          gold:          '#C9A46A',
          'gold-light':  '#EDD9B4',
          'dark-brown':  '#5C3A1E',
          bg:            '#F8F6F2',
          card:          '#FFFFFF',
          border:        '#EAE0D4',
          'text-primary':   '#3A2A1A',
          'text-secondary': '#8A7664',
          'text-muted':     '#B0A090',
          success:       '#2D6648',
          warning:       '#7A5820',
          danger:        '#8A3228',
          info:          '#2A4E6B',
          // legacy aliases
          secondary:     '#C9A46A',
          'light-gold':  '#EDD9B4',
          cream:         '#F8F6F2',
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
