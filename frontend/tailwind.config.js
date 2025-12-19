/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Primary - Fresh Green
        primary: {
          50: '#E8F5E9',
          100: '#C8E6C9',
          200: '#A5D6A7',
          300: '#81C784',
          400: '#66BB6A',
          500: '#4CAF50',
          600: '#43A047',
          700: '#388E3C',
          800: '#2E7D32',
          900: '#1B5E20',
        },
        // Secondary - Warm Gold
        secondary: {
          50: '#FFF8E1',
          100: '#FFECB3',
          200: '#FFE082',
          300: '#FFD54F',
          400: '#FFCA28',
          500: '#FFC107',
          600: '#FFB300',
          700: '#FFA000',
          800: '#FF8F00',
          900: '#FF6F00',
        },
        // Neutral
        neutral: {
          0: '#FFFFFF',
          50: '#FAFAFA',
          100: '#F5F5F5',
          200: '#EEEEEE',
          300: '#E0E0E0',
          400: '#BDBDBD',
          500: '#9E9E9E',
          600: '#757575',
          700: '#616161',
          800: '#424242',
          900: '#212121',
        },
      },
      fontFamily: {
        sans: ['Inter', 'Noto Sans', 'sans-serif'],
        display: ['Plus Jakarta Sans', 'Inter', 'sans-serif'],
      },
      boxShadow: {
        'glow-primary': '0 0 24px rgba(76, 175, 80, 0.24)',
        'glow-secondary': '0 0 24px rgba(255, 193, 7, 0.24)',
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      animation: {
        'fade-in': 'fadeIn 250ms ease-out forwards',
        'fade-in-up': 'fadeInUp 350ms ease-out forwards',
        'slide-up': 'slideUp 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'scale-in': 'scaleIn 250ms ease-out forwards',
        'float': 'float 3s ease-in-out infinite',
        'shimmer': 'shimmer 1.5s infinite linear',
      },
    },
  },
  plugins: [],
};
