import { createHash } from 'node:crypto'
import { setTimeout as sleep } from 'node:timers/promises'
import { board } from '@vercel/board'
import type { MessageView } from '@vercel/board'
import type { Event } from '../src/domain.ts'
import { actorSnapshot, normalize, normalizeActor, snapshot } from './normalize.ts'
import type { Journal } from './journal.ts'

export type FeedStatus = 'off' | 'connecting' | 'live' | 'retrying' | 'denied'
export type FeedView = { status: FeedStatus; source: string; detail: string; scope?: string }
type Handle = ReturnType<typeof board>

export function collect(handle: Handle, journal: Journal, boardId: string, channel?: string) {
  const signal = new AbortController()
  const source = channel ? boardId + ' · #' + channel : boardId
  let view: FeedView = { status: 'connecting', source, detail: 'Checking Board access.' }
  const query = { all: true, channel }

  async function bootstrap(scope: string) {
    const { cursor } = await handle.poll({ ...query, wait: 0 }, signal.signal)
    const now = Date.now()
    const observations: Event[] = []
    for (const actor of await handle.actors()) {
      observations.push(actorSnapshot(boardId, normalizeActor(actor.id, actor), now))
    }
    const channels = new Set<string>()
    if (channel) channels.add(channel)
    else {
      let after: string | undefined
      do {
        const page = await handle.channels({ after, limit: 100 })
        for (const item of page.channels) channels.add(item.path)
        after = page.next ?? undefined
      } while (after && !signal.signal.aborted)
    }
    for (const name of channels) {
      if (signal.signal.aborted) return
      const messages = new Map<string, MessageView>()
      const remember = (message: MessageView) => {
        if ((messages.get(message.id)?.version ?? -1) <= message.version) messages.set(message.id, message)
      }
      for (const message of (await handle.channel(name).messages({ limit: 100 })).messages) remember(message)
      let after: string | undefined
      while (!signal.signal.aborted) {
        const page = await handle.tasks.list({ channel: name, state: 'all', after, limit: 100 })
        for (const task of page.tasks) {
          remember(task.message)
          if (task.last) remember(task.last)
        }
        if (!page.tasks.length || after === page.cursor) break
        after = page.cursor
      }
      for (const message of messages.values()) observations.push(snapshot(boardId, message, now))
    }
    if (!signal.signal.aborted) journal.append(scope, observations, cursor)
  }

  async function follow() {
    let backoff = 1000
    while (!signal.signal.aborted) {
      try {
        const identity = await handle.me()
        if (signal.signal.aborted) return
        const discovery = await handle.discovery()
        if (signal.signal.aborted) return
        const scope = createHash('sha256').update(JSON.stringify([boardId, discovery.url, channel, identity.principal, identity.can])).digest('hex').slice(0, 24)
        if (view.scope !== scope) view = { status: 'connecting', source, detail: 'Loading Board observations.' }
        if (journal.cursor(scope) === undefined) await bootstrap(scope)
        if (signal.signal.aborted) return
        view = { status: 'live', source, scope, detail: 'Receiving Board observations.' }
        // Recheck grants periodically even when long-polls keep succeeding.
        const recheckAt = Date.now() + 60_000
        do {
          const page = await handle.poll({ ...query, after: journal.cursor(scope), wait: 15 }, signal.signal)
          if (signal.signal.aborted) return
          journal.append(scope, page.events.flatMap(event => {
            const normalized = normalize(boardId, event)
            return normalized ? [normalized] : []
          }), page.cursor)
          view = { status: 'live', source, scope, detail: 'Receiving Board observations.' }
          backoff = 1000
        } while (!signal.signal.aborted && Date.now() < recheckAt)
      } catch (error) {
        if (signal.signal.aborted) return
        const status = (error as { status?: number }).status
        if (status === 401 || status === 403) {
          view = { source, status: 'denied', detail: 'Board denied access. Check your login and read grants.' }
        } else if (status === 400 || status === 404 || status === 501) {
          view = { source, status: 'retrying', detail: 'Board could not read this feed. Check the Board URL, channel, and journal scope.' }
        } else {
          view = { ...view, status: 'retrying', detail: 'Board connection interrupted. Retrying from the saved cursor.' }
        }
        await sleep(backoff, undefined, { signal: signal.signal }).catch(() => {})
        backoff = Math.min(30_000, backoff * 2)
      }
    }
  }

  const done = follow()
  return { view: () => view, async close() { signal.abort(); await done } }
}

export function boardHandle(env: NodeJS.ProcessEnv) {
  return board({ team: env.CHESSBOARD_TEAM, name: env.CHESSBOARD_BOARD_NAME }).as(null)
}
