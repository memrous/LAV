/** @type {import('tailwindcss').Config} */

// Design tokens. Figma variables were unavailable (MCP rate limit), so values are
// sampled from reference/*.png. Token names follow the Figma convention
// (color-text-primary -> `text-text-primary`, space-lg -> `p-space-lg`).
module.exports = {
  content: ['./src/**/*.html', './src/js/**/*.js'],
  theme: {
    extend: {
      colors: {
        text: {
          primary: '#12132A', // sampled: headline, card titles
          secondary: '#4B5162', // sampled: nav, date, card date
          inverse: '#FFFFFF',
        },
        button: {
          'primary-bg': '#221E53', // sampled: "Číst článek" (also logo navy)
          'primary-text': '#FFFFFF',
          'secondary-border': 'rgba(255, 255, 255, 0.7)', // TODO(verify): border is a light hairline in the screenshot
          'accent-bg': '#F6B230', // sampled: KIS button (also logo yellow); TODO(verify) token name
          'accent-text': '#221E53',
        },
        surface: {
          page: '#D2E1EA', // TODO(verify): flat stand-in for the water/shader background
          card: 'rgba(255, 255, 255, 0.25)', // TODO(verify): card glass fill (#DAE4EB over page bg)
          'card-border': 'rgba(255, 255, 255, 0.8)', // TODO(verify)
          icon: 'rgba(255, 255, 255, 0.6)', // TODO(verify): social icon button fill
          'icon-border': '#E3E7EF', // TODO(verify)
        },
      },
      // TODO(verify): scale inferred from measured gaps (8/16/24/32/40/80 px), Figma names unconfirmed.
      spacing: {
        'space-2xs': '0.25rem', // 4
        'space-xs': '0.5rem', // 8
        'space-sm': '1rem', // 16
        'space-md': '1.5rem', // 24
        'space-lg': '2rem', // 32
        'space-xl': '2.5rem', // 40
        'space-2xl': '5rem', // 80 – page gutter on desktop
      },
      borderRadius: {
        'radius-sm': '0.5rem', // 8 – thumbnails, icon buttons; TODO(verify)
        'radius-md': '0.75rem', // 12 – cards; TODO(verify)
        'radius-full': '9999px', // pill buttons
      },
      fontFamily: {
        display: ['"Schibsted Grotesk"', 'system-ui', 'sans-serif'],
        label: ['Play', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // TODO(verify): all sizes measured from 1440px screenshots
        'display-xl': ['3.75rem', { lineHeight: '1.05', letterSpacing: '-0.04em' }], // 60 hero headline
        'display-lg': ['3rem', { lineHeight: '1.05', letterSpacing: '-0.03em' }], // 48 tablet
        'display-md': ['2.25rem', { lineHeight: '1.1', letterSpacing: '-0.03em' }], // 36 mobile
        label: ['0.6875rem', { lineHeight: '1rem', letterSpacing: '0.02em' }], // 11 date / scroll hint
        body: ['0.875rem', { lineHeight: '1.45' }], // 14 nav, card title
        button: ['1rem', { lineHeight: '1.5rem' }], // 16
      },
      maxWidth: {
        container: '90rem', // 1440 frame
      },
    },
  },
  plugins: [],
};
