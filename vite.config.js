import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

// https://vitejs.dev/config/
export default defineConfig({
  base: './',
  plugins: [
    react(),
    {
      name: 'html-dev-entry',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url === '/' || req.url === '/index.html') {
            req.url = '/index.dev.html';
          }
          next();
        });
      }
    }
  ],
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.dev.html')
      },
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          pdf: ['html2pdf.js'],
          excel: ['xlsx'],
          charts: ['recharts']
        }
      }
    }
  },
  server: {
    port: 3000,
    open: true
  }
});
