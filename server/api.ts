import type { IncomingMessage, ServerResponse } from 'node:http'
import { openJournal } from './journal.ts'
import { boardHandle, collect } from './collector.ts'
import type { FeedView } from './collector.ts'
import { readReceipt } from './runledger.ts'
import { roles } from '../src/domain.ts'

export function createApi(env: NodeJS.ProcessEnv) {
  const enabled = Boolean(env.BOARD_URL || env.CHESSBOARD_TEAM || env.VERCEL_ORG_ID || env.CHESSBOARD_LIVE === '1')
  const boardId = env.BOARD_URL ?? [env.CHESSBOARD_TEAM ?? env.VERCEL_ORG_ID ?? 'linked', env.CHESSBOARD_BOARD_NAME ?? 'General'].join('/')
  const journal = enabled ? openJournal(env.CHESSBOARD_DB ?? '.chessboard/live.sqlite') : undefined
  const handle = enabled ? boardHandle(env) : undefined
  const feed = journal && handle ? collect(handle, journal, boardId, env.CHESSBOARD_CHANNEL) : undefined
  const roleConfig: unknown = JSON.parse(env.CHESSBOARD_ROLES ?? '{}')
  const mapping = Object.fromEntries(Object.entries(roleConfig ?? {}).filter(([, role]) => roles.some(value => value === role)))
  const off: FeedView = { status: 'off', source: 'Vercel Board', detail: 'Set BOARD_URL or CHESSBOARD_TEAM and restart to connect.' }

  return {
    route(req: IncomingMessage, res: ServerResponse): boolean {
      if (!req.url?.startsWith('/api/')) return false
      const json = (status: number, data: unknown) => {
        res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' })
        res.end(JSON.stringify(data))
      }
      const host = req.headers.host ?? ''
      if (!/^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/.test(host) ||
        (req.headers.origin && req.headers.origin !== 'http://' + host) || req.headers['sec-fetch-site'] === 'cross-site') {
        json(403, { error: 'Local same-origin access required.' })
        return true
      }
      if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET')
        json(405, { error: 'Chessboard is read-only.' })
        return true
      }
      const url = new URL(req.url, 'http://localhost')
      const evidence = url.pathname.match(/^\/api\/thread-evidence\/([A-Za-z0-9_-]{1,200})$/)
      if (evidence) {
        const id = evidence[1]
        if (!handle || !feed?.view().scope) {
          json(503, { error: 'Board must be connected to read thread evidence.' })
          return true
        }
        void handle.thread(id).then(async ({ message }) => {
          if (env.CHESSBOARD_CHANNEL && message.channel !== env.CHESSBOARD_CHANNEL) {
            json(404, { error: 'Thread is outside the configured channel.' })
            return
          }
          const destinations = await handle.sync(message.id).catch(() => ({ targets: [] }))
          const links = destinations.targets.flatMap(target => {
            try {
              const url = new URL(target.url ?? '')
              return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password ? [url.href] : []
            } catch {
              return []
            }
          })
          const receipt = env.CHESSBOARD_RUNLEDGER_DIR && message.labels.runledger
            ? await readReceipt(env.CHESSBOARD_RUNLEDGER_DIR, message.labels.runledger) : undefined
          json(200, { links, receipt })
        }).catch(() => json(404, { error: 'Thread evidence is unavailable.' }))
        return true
      }
      if (url.pathname !== '/api/events') {
        json(404, { error: 'Unknown endpoint.' })
        return true
      }
      const view = feed?.view() ?? off
      const supplied = url.searchParams.get('scope')
      const after = supplied === view.scope ? Number(url.searchParams.get('after') ?? 0) : 0
      if (!Number.isSafeInteger(after) || after < 0) {
        json(400, { error: 'Invalid event offset.' })
        return true
      }
      const events = journal && view.scope ? journal.read(view.scope, after, 250) : []
      json(200, { ...view, mapping, events, more: events.length === 250 })
      return true
    },
    async close() {
      await feed?.close()
      journal?.close()
    },
  }
}
