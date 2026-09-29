import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [
      tailwindcss(),
      react(),
    ],
    server: {
      port: 5173,
      host: true,
      allowedHosts: true,
      proxy: {
        '/api': {
          target: env.VITE_API_URL,
          changeOrigin: true
        },
        // Voice agent (separate service, see /voice-agent) — proxied so the
        // browser talks to one origin, same pattern as /api above.
        '/voice-ws': {
          target: env.VITE_VOICE_WS_URL,
          ws: true,
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/voice-ws/, '/ws')
        }
      }
    }
  };
});
