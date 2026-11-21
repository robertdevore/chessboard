import { useEffect, useState } from 'react'
import type { Event, Role } from './domain.ts'

type Feed = {
  status: string; source: string; detail: string; scope?: string
  events: Event[]; mapping: Record<string, Role>; more?: boolean; reset?: boolean; epoch?: number
}
const initial: Feed = { status: 'connecting', source: 'Vercel Board', detail: 'Checking local collector.', events: [], mapping: {} }

export function useFeed(enabled: boolean) {
  const [feed, setFeed] = useState<Feed>(initial)
  useEffect(() => {
    if (!enabled) {
      setFeed(initial)
      return
    }
    const controller = new AbortController()
    let after = 0
    let scope: string | undefined
    let seen: string | undefined
    let timer: ReturnType<typeof setTimeout>
    let failureDelay = 1000
    async function read() {
      let delay = 1200
      try {
        const query = new URLSearchParams({ after: String(after), scope: scope ?? '' })
        if (seen !== undefined) query.set('seen', seen)
        const response = await fetch('/api/events?' + query, {
          signal: controller.signal, cache: 'no-store',
        })
        if (!response.ok) throw new Error('Collector response failed')
        const next: Feed = await response.json()
        if (controller.signal.aborted) return
        if (next.scope !== scope || next.reset) {
          after = 0
          seen = undefined
        }
        scope = next.scope
        const latest = next.events.at(-1)
        if (latest) {
          after = latest.order
          seen = latest.id
        }
        setFeed(previous => {
          const mapping = JSON.stringify(previous.mapping) === JSON.stringify(next.mapping) ? previous.mapping : next.mapping
          const sameScope = next.scope === previous.scope && !next.reset
          const incoming = sameScope && next.scope
            ? next.events.filter(event => event.order > (previous.events.at(-1)?.order ?? 0))
            : next.events
          const events = sameScope
            ? incoming.length ? previous.events.concat(incoming) : previous.events
            : incoming
          if (sameScope && events === previous.events && mapping === previous.mapping && next.status === previous.status &&
            next.source === previous.source && next.detail === previous.detail && next.more === previous.more) return previous
          return { ...next, mapping, events, epoch: (previous.epoch ?? 0) + Number(Boolean(next.reset)) }
        })
        failureDelay = 1000
        delay = next.more ? 20 : 1200
      } catch {
        if (controller.signal.aborted) return
        delay = failureDelay
        failureDelay = Math.min(15_000, failureDelay * 2)
        const detail = 'Local collector disconnected. Reconnecting.'
        setFeed(previous => previous.status === 'retrying' && previous.detail === detail
          ? previous : { ...previous, status: 'retrying', detail })
      }
      timer = setTimeout(read, delay)
    }
    void read()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [enabled])
  return feed
}
