import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5173 },
  build: {
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts') || id.includes('d3-')) return 'charts';
            if (id.includes('jspdf') || id.includes('html2canvas') || id.includes('canvg')) return 'pdf';
            if (id.includes('jsqr') || id.includes('qrcode')) return 'qr';
            return 'vendor';
          }
        },
      },
    },
  },
});
