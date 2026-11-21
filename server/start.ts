import { createServer } from 'node:http'
import { constants, existsSync, realpathSync } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { pipeline } from 'node:stream/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'
import { createApi } from './api.ts'
import { privateStorage } from './storagePaths.ts'

const output = resolve('dist')
if (!existsSync(resolve(output, 'index.html'))) throw new Error('Run npm run build first.')
const root = realpathSync(output)
privateStorage(process.env, ['public', 'dist'])
const api = createApi(process.env)
const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' }
async function serve(req: IncomingMessage, res: ServerResponse) {
  if (api.route(req, res)) return
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' }).end()
    return
  }
  const path = new URL(req.url ?? '/', 'http://localhost').pathname
  const file = resolve(root, '.' + (path === '/' ? '/index.html' : path))
  if (!file.startsWith(root + sep)) {
    res.writeHead(404).end()
    return
  }
  const target = await realpath(file)
  if (!target.startsWith(root + sep)) {
    res.writeHead(404).end()
    return
  }
  const handle = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
  try {
    const info = await handle.stat()
    if (!info.isFile()) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Content-Length': info.size,
      'X-Content-Type-Options': 'nosniff',
    })
    if (req.method === 'HEAD') res.end()
    else await pipeline(handle.createReadStream({ autoClose: false }), res)
  } finally {
    await handle.close()
  }
}

const server = createServer((req, res) => {
  void serve(req, res).catch((error: NodeJS.ErrnoException) => {
    if (res.destroyed) return
    if (res.headersSent) res.destroy()
    else res.writeHead(['ENOENT', 'ENOTDIR', 'ELOOP'].includes(error.code ?? '') ? 404 : 500).end()
  })
})
server.listen(Number(process.env.PORT ?? 5173), '127.0.0.1', () => {
  console.log('Chessboard is listening on', server.address())
})
process.once('SIGINT', async () => { server.close(); await api.close() })
process.once('SIGTERM', async () => { server.close(); await api.close() })
