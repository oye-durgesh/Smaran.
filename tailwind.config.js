/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { plum: '#39264B', 'plum-l': '#EEE7F2', cream: '#FAF8F4', sage: '#718C72', peach: '#F2C9B5', warn: '#D79A46', danger: '#C65B58', ink: '#29252D', mute: '#85808A', line: '#EAE5E9' },
    fontFamily: { hd: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'], sans: ['Inter', 'system-ui', 'sans-serif'] },
  } },
};
