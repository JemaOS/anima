/** @type {import('tailwindcss').Config} */
module.exports = {
	darkMode: ['class'],
	content: [
		'./pages/**/*.{ts,tsx}',
		'./components/**/*.{ts,tsx}',
		'./app/**/*.{ts,tsx}',
		'./src/**/*.{ts,tsx}',
	],
	theme: {
		container: {
			center: true,
			padding: '2rem',
			screens: {
				mobile: '640px',
				tablet: '1024px',
				desktop: '1440px',
			},
		},
		extend: {
			// Design tokens JEMA Technology + Google Meet 2025
			colors: {
				// Primary (JEMA Violet - replaces Google Blue)
				primary: {
					50: '#F5F4FE',
					100: '#E8E6FC',
					200: '#D7D6F5', // Lavande pâle JEMA
					300: '#A9A4F0',
					400: '#8F88ED',
					500: '#6E60E8', // Violet primaire JEMA (main)
					600: '#5242ED', // Violet accent JEMA
					700: '#4432C9',
					800: '#3627A5',
					900: '#2A1F81',
				},
				// Secondary (Violet-Bleu clair JEMA)
				secondary: {
					400: '#8F94FF',
					500: '#6A6FFC',
					600: '#5459E8',
				},
				// Neutral (Dark Mode - Keep from Meet)
				neutral: {
					50: '#FFFFFF',
					100: '#E8EAED',
					400: '#9AA0A6',
					600: '#3C3C3C',
					700: '#2D2D2D',
					800: '#1F1F1F',
					900: '#0F0F0F', // Main dark background
				},
				// Surface (Light Mode - JEMA)
				surface: {
					bg: '#F0F2F5', // Fond clair JEMA (replaces white)
					card: '#FFFFFF',
					elevated: '#FFFFFF',
					border: '#E0E2E5',
				},
				// Semantic colors
				danger: {
					400: '#F28B82',
					500: '#EA4335', // Google Red (keep for disconnect)
				},
				success: {
					500: '#34A853', // Google Green
				},
				warning: {
					400: '#F5C042',
					500: '#FBBC04', // Google Yellow
				},
				accent: {
					orange: '#E69138', // Orange brûlé JEMA
					purple: '#6E60E8', // Alias for primary
				},
			},
			fontFamily: {
				primary: ['Inter', 'Google Sans', 'Roboto', 'system-ui', 'sans-serif'],
				secondary: ['Inter', 'Roboto', 'system-ui', 'sans-serif'],
				mono: ['Roboto Mono', 'monospace'],
			},
			fontSize: {
				display: '36px',
				headline: '24px',
				title: '20px',
				'body-lg': '16px',
				body: '14px',
				label: '12px',
				caption: '11px',
			},
			spacing: {
				1: '4px',
				2: '8px',
				3: '12px',
				4: '16px',
				5: '24px',
				6: '32px',
				8: '48px',
				10: '64px',
				12: '96px',
			},
			borderRadius: {
				sm: '8px',
				md: '12px', // JEMA: Augmenté de 8px à 12px
				lg: '16px', // JEMA: Augmenté de 12px à 16px
				xl: '20px', // JEMA: Augmenté de 16px à 20px
				'2xl': '24px',
				full: '9999px',
			},
			boxShadow: {
				// JEMA: Ombres plus subtiles
				sm: '0 2px 8px rgba(0, 0, 0, 0.04)',
				card: '0 4px 16px rgba(0, 0, 0, 0.06)',
				elevated: '0 8px 24px rgba(0, 0, 0, 0.08)',
				modal: '0 12px 32px rgba(0, 0, 0, 0.12)',
				// Ombres spécifiques JEMA violet
				'primary': '0 2px 8px rgba(110, 96, 232, 0.2)',
				'primary-hover': '0 4px 12px rgba(110, 96, 232, 0.3)',
			},
			animation: {
				'duration-instant': '100ms',
				'duration-fast': '150ms',
				'duration-normal': '200ms', // JEMA: Réduit de 250ms à 200ms
				'duration-slow': '300ms', // JEMA: Réduit de 350ms à 300ms
			},
			transitionTimingFunction: {
				default: 'cubic-bezier(0.4, 0, 0.2, 1)',
				enter: 'cubic-bezier(0, 0, 0.2, 1)',
				exit: 'cubic-bezier(0.4, 0, 1, 1)',
			},
			backdropBlur: {
				xs: '2px',
				sm: '4px',
				md: '10px',
				lg: '15px',
				xl: '20px', // JEMA: Pour glassmorphism
			},
		},
	},
	plugins: [require('tailwindcss-animate')],
}
