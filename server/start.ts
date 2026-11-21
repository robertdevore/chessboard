import { createServer } from 'node:http'
import { createReadStream, existsSync, statSync } from 'node:fs'
import { extname, resolve, sep } from 'node:path'
import { createApi } from './api.ts'

const root = resolve('dist')
if (!existsSync(resolve(root, 'index.html'))) throw new Error('Run npm run build first.')
const api = createApi(process.env)
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
const server = createServer((req, res) => {
  if (api.route(req, res)) return
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path))
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
    res.writeHead(404).end()
    return
  }
  res.writeHead(200, { 'Content-Type': types[extname(file)] ?? 'application/octet-stream' })
  createReadStream(file).pipe(res)
})
server.listen(Number(process.env.PORT ?? 5173), '127.0.0.1', () => {
  console.log('Chessboard is listening on', server.address())
})
process.once('SIGINT', async () => { server.close(); await api.close() })
process.once('SIGTERM', async () => { server.close(); await api.close() })
