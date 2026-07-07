import type { Config } from 'tailwindcss';

export default {
  content: ['./src/renderer/index.html', './src/renderer/**/*.{vue,ts}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"Microsoft YaHei"', '"PingFang SC"', 'system-ui', 'sans-serif'],
      },
      colors: {
        surface: {
          app: 'var(--vt-surface-app)',
          panel: 'var(--vt-surface-panel)',
          raised: 'var(--vt-surface-raised)',
        },
        line: {
          soft: 'var(--vt-line-soft)',
          strong: 'var(--vt-line-strong)',
        },
        text: {
          primary: 'var(--vt-text-primary)',
          secondary: 'var(--vt-text-secondary)',
          muted: 'var(--vt-text-muted)',
        },
        brand: {
          DEFAULT: 'var(--vt-brand)',
          strong: 'var(--vt-brand-strong)',
        },
        state: {
          success: 'var(--vt-success)',
          warning: 'var(--vt-warning)',
          danger: 'var(--vt-danger)',
        },
      },
      boxShadow: {
        panel: 'var(--vt-shadow-panel)',
      },
      keyframes: {
        'model-test-image-reveal': {
          '0%': {
            filter: 'blur(18px) saturate(0.72)',
            opacity: '0.72',
            transform: 'scale(1.015)',
          },
          '100%': {
            filter: 'blur(0) saturate(1)',
            opacity: '1',
            transform: 'scale(1)',
          },
        },
        'model-test-scan': {
          '0%': {
            opacity: '0',
            transform: 'translateY(-28%)',
          },
          '18%, 82%': {
            opacity: '1',
          },
          '100%': {
            opacity: '0',
            transform: 'translateY(360%)',
          },
        },
        'model-test-drift': {
          '0%, 100%': {
            opacity: '0.72',
            transform: 'rotate(0deg) scale(1)',
          },
          '50%': {
            opacity: '1',
            transform: 'rotate(45deg) scale(0.92)',
          },
        },
        'model-test-pulse': {
          '0%, 100%': {
            opacity: '0.72',
            transform: 'translate(-50%, -50%) scale(0.7)',
          },
          '50%': {
            opacity: '1',
            transform: 'translate(-50%, -50%) scale(1.15)',
          },
        },
        'model-test-dot': {
          '0%, 80%, 100%': {
            opacity: '0.45',
            transform: 'translateY(0)',
          },
          '40%': {
            opacity: '1',
            transform: 'translateY(-5px)',
          },
        },
      },
      animation: {
        'model-test-image-reveal': 'model-test-image-reveal 900ms cubic-bezier(0.2, 0.8, 0.2, 1) both',
        'model-test-scan': 'model-test-scan 2.4s ease-in-out infinite',
        'model-test-drift': 'model-test-drift 2.8s ease-in-out infinite',
        'model-test-pulse': 'model-test-pulse 1.4s ease-in-out infinite',
        'model-test-dot': 'model-test-dot 1s ease-in-out infinite',
      },
    },
  },
  plugins: [],
} satisfies Config;
