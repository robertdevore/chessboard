import { useEffect, useState } from 'react'
import type { Event, Role } from './domain.ts'

type Feed = {
  status: string; source: string; detail: string; scope?: string
  events: Event[]; mapping: Record<string, Role>; more?: boolean
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
    let timer: ReturnType<typeof setTimeout>
    let failureDelay = 1000
    async function read() {
      let delay = 1200
      try {
        const response = await fetch('/api/events?' + new URLSearchParams({ after: String(after), scope: scope ?? '' }), {
          signal: controller.signal, cache: 'no-store',
        })
        if (!response.ok) throw new Error('Collector response failed')
        const next: Feed = await response.json()
        if (controller.signal.aborted) return
        if (next.scope !== scope) after = 0
        scope = next.scope
        after = next.events.at(-1)?.order ?? after
        setFeed(previous => ({
          ...next,
          mapping: JSON.stringify(previous.mapping) === JSON.stringify(next.mapping) ? previous.mapping : next.mapping,
          events: next.scope && next.scope === previous.scope
            ? next.events.length ? previous.events.concat(next.events.filter(event => event.order > (previous.events.at(-1)?.order ?? 0))) : previous.events
            : next.events,
        }))
        failureDelay = 1000
        delay = next.more ? 20 : 1200
      } catch {
        if (controller.signal.aborted) return
        delay = failureDelay
        failureDelay = Math.min(15_000, failureDelay * 2)
        setFeed(previous => ({ ...previous, status: 'retrying', detail: 'Local collector disconnected. Reconnecting.' }))
      }
      timer = setTimeout(read, delay)
    }
    void read()
    return () => { controller.abort(); clearTimeout(timer) }
  }, [enabled])
  return feed
}
