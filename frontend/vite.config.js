import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  server: {
    allowedHosts: [
      '<your-ngrok-domain>.ngrok-free.dev'
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true
      },
      // Voice agent (separate service, see /voice-agent) — proxied so the
      // browser talks to one origin, same pattern as /api above.
      '/voice-ws': {
        target: 'http://localhost:8090',
        ws: true,
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/voice-ws/, '/ws')
      }
    }
  }
})
