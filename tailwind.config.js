/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./*.{js,ts,jsx,tsx}"
    ],
    darkMode: 'class',
    theme: {
        extend: {
            keyframes: {
                // P3.3 — overlay-enter agora declarado no config (elimina dependência implícita do index.css)
                'overlay-enter': {
                    '0%':   { opacity: '0', transform: 'scale(0.97)' },
                    '100%': { opacity: '1', transform: 'scale(1)' },
                },
                'slide-in': {
                    '0%':   { opacity: '0', transform: 'translateY(8px)' },
                    '100%': { opacity: '1', transform: 'translateY(0)' },
                },
            },
            animation: {
                'fade-in':       'overlay-enter 0.4s ease-out forwards',
                'slide-up':      'overlay-enter 0.3s ease-out forwards',
                'overlay-enter': 'overlay-enter 0.4s ease-out forwards',
                'slide-in':      'slide-in 0.25s ease-out forwards',
            },
        },
    },
    plugins: [],
}
