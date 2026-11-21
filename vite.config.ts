import { defineConfig, loadEnv, normalizePath } from 'vite'
import react from '@vitejs/plugin-react'
import { createApi } from './server/api.ts'

import { privateStorage } from './server/storagePaths.ts'

export default defineConfig(({ mode }) => {
  const root = process.cwd()
  const env = { ...loadEnv(mode, root, ''), ...process.env }
  const deny = ['.env', '.env.*', '*.{crt,pem,sqlite,sqlite-wal,sqlite-shm,db,db-wal,db-shm}', '**/.git/**', '**/.chessboard/**', '**/.board/**', '**/.vercel/**']
  for (const { path, directory } of privateStorage(env, ['public', 'dist'])) {
    const prefix = normalizePath(path).replace(/[?*\[\]{}()!+@]/g, '\\$&')
    if (directory) deny.push(prefix + '/**')
    else deny.push(prefix, prefix + '-wal', prefix + '-shm', prefix + '-journal')
  }

  return {
    plugins: [react(), {
      name: 'chessboard-local-api',
      configureServer(server) {
        // The SDK reads these values directly from process.env.
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
      fs: { allow: [root], deny },
    },
  }
})
