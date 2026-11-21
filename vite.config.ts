import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { createApi } from './server/api.ts'

export default defineConfig(({ mode }) => ({
  plugins: [react(), {
    name: 'chessboard-local-api',
    configureServer(server) {
      const env = { ...loadEnv(mode, process.cwd(), ''), ...process.env }
      // The SDK resolves these documented settings directly from process.env.
      for (const key of ['BOARD_URL', 'BOARD_TOKEN', 'VERCEL_AUTH_TOKEN', 'VERCEL_ORG_ID']) {
        if (env[key]) process.env[key] = env[key]
      }
      const api = createApi(env)
      server.middlewares.use((req, res, next) => { if (!api.route(req, res)) next() })
      server.httpServer?.once('close', () => { void api.close() })
    },
  }],
  server: {
    host: '127.0.0.1', port: 5173, strictPort: true,
    fs: {
      allow: [process.cwd()],
      deny: ['.env', '.env.*', '*.{crt,pem,sqlite,sqlite-wal,sqlite-shm,db,db-wal,db-shm}', '**/.git/**', '**/.chessboard/**', '**/.board/**', '**/.vercel/**'],
    },
  },
}))
