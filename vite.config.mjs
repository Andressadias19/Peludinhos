import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const backend = `http://127.0.0.1:${env.PORT || 3001}`;
  return {
    plugins: [react(), tailwindcss()],
    publicDir: 'public',
    server: { host: '127.0.0.1', port: 5173, strictPort: true, proxy: { '/api': backend, '/uploads': backend } },
  };
});
