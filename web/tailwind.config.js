export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        display: ['Poppins', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: '#12172b',
        cyan: '#0891b2',
        violet: '#7c3aed',
        pink: '#db2777',
        amber: '#b45309',
        success: '#059669',
        danger: '#dc2626',
      },
      boxShadow: {
        glass: '0 4px 24px rgba(20,25,45,0.06)',
        lift: '0 18px 45px rgba(20,25,45,0.14)',
      },
      borderRadius: {
        card: '20px',
      },
    },
  },
  plugins: [],
};
