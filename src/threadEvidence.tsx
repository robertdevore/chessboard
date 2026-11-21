import { useEffect, useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import type { Receipt } from '../server/runledger.ts'

type Evidence = { links: string[]; receipt?: Receipt }

export function ThreadEvidence({ thread, links, live }: { thread?: string; links: string[]; live: boolean }) {
  const [opened, setOpened] = useState(false)
  const [evidence, setEvidence] = useState<{ thread: string; data: Evidence }>()
  useEffect(() => {
    if (!live || !thread || !opened) return
    const controller = new AbortController()
    void fetch('/api/thread-evidence/' + encodeURIComponent(thread), { signal: controller.signal })
      .then(response => response.ok ? response.json() : { links: [] })
      .then(data => { if (!controller.signal.aborted) setEvidence({ thread, data }) })
      .catch(() => { if (!controller.signal.aborted) setEvidence({ thread, data: { links: [] } }) })
    return () => controller.abort()
  }, [thread, live, opened])
  const data = evidence?.thread === thread ? evidence?.data : undefined
  const destinations = [...new Set([...links, ...data?.links ?? []])]
  const receipt = data?.receipt
  return <details onToggle={event => setOpened(event.currentTarget.open)}>
    <summary>Source links</summary>
    {destinations.map(link => <a className="plain-link" key={link} href={link} target="_blank" rel="noreferrer">{link} <ArrowUpRight size={13}/></a>)}
    {!destinations.length && <p>{live && thread && !data ? 'Checking for a synced thread…'
      : thread ? 'No thread permalink supplied. Board thread reference ' + thread + '.' : 'Unavailable.'}</p>}
    {receipt && <p>Kujo RunLedger · {receipt.id}<br/>{receipt.task} · {receipt.status}<br/>{receipt.model} · {receipt.testCount} recorded tests · {receipt.updated}</p>}
  </details>
}
