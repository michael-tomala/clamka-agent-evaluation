import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: parseInt(process.env.EVAL_DASHBOARD_PORT || '3101'),
    proxy: {
      '/api': {
        target: `http://localhost:${process.env.EVAL_API_PORT || '3100'}`,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});
