import { useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties } from 'react'
import {
  Activity, ArrowDownRight, ArrowRight, ChevronLeft, ChevronRight, CircleHelp, Clock3,
  Crosshair, Layers, ListFilter, Pause, Play, Radio, RotateCcw, Search, Terminal, X,
} from 'lucide-react'
import { advance, emptyState, files, nextLeaseExpiry, refreshAt, roles, square, visibleInMission } from './domain.ts'
import type { Event, Piece, Role, State, Status } from './domain.ts'
import { demoEvents, demoMission, demoPreview } from './demo.ts'
import { ChessPiece, pieceNames } from './pieces.tsx'
import { ThreadEvidence } from './threadEvidence.tsx'
import { useFeed } from './useFeed.ts'

type Mode = 'Live' | 'Replay' | 'Demo'
const modes: Mode[] = ['Live', 'Replay', 'Demo']
const statuses: Status[] = ['Unknown', 'Staged', 'Executing', 'Verifying', 'Blocked', 'Delivered', 'Failed']
const squares = Array.from({ length: 64 }, (_, index) => index)
const emptyEvents: Event[] = []
const emptyMapping: Record<string, Role> = {}
const batchSize = 30
const time = (milliseconds?: number) => milliseconds === undefined ? 'Unavailable' : new Date(milliseconds).toISOString().slice(11, 19)
const formatType = (type: string) => type.replaceAll('_', ' ').replaceAll('.', ' ')
const normalizeSearch = (value: string) => value.toLocaleLowerCase().trim()

function useProjection(events: Event[], mapping: Record<string, Role>, filtered: boolean) {
  const cache = useRef({ events: emptyEvents, mapping: emptyMapping, state: emptyState() })
  return useMemo(() => {
    const previous = cache.current
    const index = previous.events.length
    const extendsHistory = previous.mapping === mapping && index <= events.length &&
      previous.events[0] === events[0] && (!index || previous.events[index - 1] === events[index - 1]) &&
      (!filtered || previous.events.every((event, position) => event === events[position]))
    const state = advance(extendsHistory ? previous.state : emptyState(), extendsHistory ? events.slice(index) : events, undefined, mapping)
    cache.current = { events, mapping, state }
    return state
  }, [events, mapping, filtered])
}

export function App() {
  const [mode, setMode] = useState<Mode>('Demo')
  const feed = useFeed(mode !== 'Demo')
  const [playing, setPlaying] = useState(false)
  const [cursor, setCursor] = useState(demoPreview)
  const [liveHold, setLiveHold] = useState<number>()
  const [speed, setSpeed] = useState(1)
  const [leaseTick, advanceLeaseClock] = useState(0)
  const [heldTime, setHeldTime] = useState<number>()
  const [mission, setMission] = useState('')
  const [role, setRole] = useState('')
  const [status, setStatus] = useState('')
  const [channel, setChannel] = useState('')
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState('demo:audit')
  const [taskId, setTaskId] = useState('')
  const [page, setPage] = useState(0)
  const [history, setHistory] = useState(0)
  const [showTasks, setShowTasks] = useState(false)
  const [flat, setFlat] = useState(false)
  const inspectorNode = useRef<HTMLElement>(null)

  const all = mode === 'Demo' ? demoEvents : feed.events
  const end = mode === 'Live' ? liveHold ?? all.length : cursor
  const visible = useMemo(() => all.slice(0, end), [all, end])
  const missions = useMemo(() => [...new Set(visible.flatMap(event => event.metadata?.mission ?? []))].sort(), [visible])
  const scoped = useMemo(() => visibleInMission(visible, mission), [visible, mission])
  const mapping = mode === 'Demo' ? emptyMapping : feed.mapping
  const projected = useProjection(scoped, mapping, Boolean(mission))
  const wallTime = mode === 'Live' ? heldTime ?? Date.now() : undefined
  const projectedAt = scoped.at(-1)?.timestamp ?? 0
  const state = useMemo(() => wallTime === undefined ? projected : refreshAt(projected, wallTime, projectedAt),
    [projected, wallTime, projectedAt])
  const nextExpiry = wallTime !== undefined && heldTime === undefined
    ? nextLeaseExpiry(projected, Math.max(wallTime, projectedAt)) : undefined
  const agents = [...state.agents.values()]
  const tasks = [...state.tasks.values()].filter(task => !channel || task.event.channelId === channel)
  const channels = useMemo(() => [...new Set(scoped.flatMap(event => event.channelId ?? []))].sort(), [scoped])
  const query = normalizeSearch(search)
  const matchingTasks = tasks.filter(({ event, task }) => normalizeSearch(task.title + ' ' + event.taskId).includes(query))
  const matching = agents.filter(agent =>
    (!role || agent.role === role) && (!status || agent.status === status) &&
    (!channel || agent.channel === channel || agent.assignments.some(item => item.event.channelId === channel)) &&
    (!query || normalizeSearch(agent.name + ' ' + agent.id + ' ' + agent.assignments.map(item => item.task.title).join(' ')).includes(query)))
  const boards = Math.max(1, ...agents.map(agent => (agent.position?.board ?? 0) + 1))
  const currentPage = Math.min(page, boards - 1)
  const displayed = matching.filter(agent => agent.position?.board === currentPage)
  const inspected = state.agents.get(selected)
  const inspectedTask = state.tasks.get(taskId)
  const activity = useMemo(() => scoped.filter(event => (!channel || event.channelId === channel) && event.type !== 'snapshot.actor' &&
    (!query || normalizeSearch([event.actor?.name, event.message?.text, event.task?.title, event.taskId].join(' ')).includes(query))), [scoped, channel, query])
  const historyPage = Math.min(history, Math.max(0, Math.ceil(activity.length / batchSize) - 1))
  const activityEnd = activity.length - historyPage * batchSize
  const counts = {
    active: agents.filter(agent => ['Executing', 'Verifying'].includes(agent.status) && (!channel || agent.assignments[0]?.event.channelId === channel)).length,
    tasks: tasks.length, ready: tasks.filter(item => item.task.state === 'ready').length,
    ongoing: tasks.filter(item => item.task.state === 'claimed').length,
    blocked: tasks.filter(item => item.task.state === 'blocked').length,
    done: tasks.filter(item => item.task.state === 'completed').length,
    failed: tasks.filter(item => item.task.state === 'failed').length,
  }

  useEffect(() => {
    if (nextExpiry === undefined) return
    const timeout = setTimeout(() => advanceLeaseClock(tick => tick + 1),
      Math.min(2_147_483_647, Math.max(1, nextExpiry - Date.now())))
    return () => clearTimeout(timeout)
  }, [nextExpiry, leaseTick])
  useEffect(() => {
    if (!playing || mode === 'Live') return
    if (cursor >= all.length) {
      setPlaying(false)
      return
    }
    const gap = cursor === 0 ? 0 : all[cursor].timestamp - all[cursor - 1].timestamp
    const timer = setTimeout(() => setCursor(value => value + 1), Math.min(1800, Math.max(45, gap)) / speed)
    return () => clearTimeout(timer)
  }, [all, cursor, mode, playing, speed])
  // A new feed scope or journal resets the cursor and any held live view.
  useEffect(() => {
    setLiveHold(undefined)
    setHeldTime(undefined)
    if (mode === 'Replay') setCursor(0)
  }, [feed.scope, feed.epoch])

  function changeMode(next: Mode) {
    if (next === mode) return
    setMode(next)
    setPlaying(false)
    setCursor(next === 'Demo' ? demoPreview : 0)
    setLiveHold(undefined)
    setHeldTime(undefined)
    setMission('')
    setChannel('')
    setRole('')
    setStatus('')
    setSearch('')
    setSelected(next === 'Demo' ? 'demo:audit' : '')
    setTaskId('')
    setPage(0)
    setHistory(0)
    setShowTasks(false)
  }

  function selectAgent(agent: Piece, openOnMobile = false) {
    setSelected(agent.id)
    setTaskId('')
    setPage(agent.position?.board ?? 0)
    if (openOnMobile && window.matchMedia('(max-width: 760px)').matches) {
      inspectorNode.current?.scrollIntoView({ block: 'start' })
      inspectorNode.current?.focus({ preventScroll: true })
    }
  }

  function togglePlayback() {
    if (mode === 'Live') {
      setLiveHold(liveHold === undefined ? all.length : undefined)
      setHeldTime(liveHold === undefined ? Date.now() : undefined)
      return
    }
    if (cursor >= all.length) setCursor(0)
    setPlaying(!playing)
  }

  const paused = mode === 'Live' ? liveHold !== undefined : !playing
  const current = all[end - 1]
  const feedBadge = mode === 'Demo' ? 'Simulated data' : mode === 'Replay' ? 'Recorded data' :
    ({ live: 'Connected', off: 'Not configured', retrying: 'Reconnecting', denied: 'Access denied', connecting: 'Connecting' })[feed.status] ?? feed.status
  const missionTitle = mode === 'Demo' ? demoMission : mission || (mode === 'Live' ? 'Vercel Board' : 'Recorded activity')
  const idleTitle = mode === 'Replay' ? 'No recorded position' : 'Waiting for Board activity'

  return <>
    <header className="topbar">
      <div className="top-inner">
        <a className="brand" href="/" aria-label="Chessboard home"><img src="/mark.svg" alt="" /> Chessboard</a>
        <nav className="modes" aria-label="Operating mode">
          {modes.map(item => <button key={item} aria-pressed={mode === item} onClick={() => changeMode(item)}>
            {item === 'Live' ? <Radio size={14}/> : item === 'Replay' ? <Clock3 size={14}/> : <Layers size={14}/>} {item}
          </button>)}
        </nav>
        <span className="connection" role="status"><i className={feed.status === 'live' && mode === 'Live' ? 'connected' : ''}/>{feedBadge}</span>
      </div>
    </header>

    <main className="shell">
      <section className="mission" aria-labelledby="mission-title">
        <div>
          <div className="eyebrow"><Crosshair size={13}/> {mode === 'Demo' ? 'Demo mission' : 'Mission overview'}</div>
          <h1 id="mission-title">{missionTitle}</h1>
        </div>
        <div className="mission-source"><Terminal size={15}/>{mode === 'Demo' ? 'Workspace Search / Scenario' : feed.source}</div>
      </section>

      <dl className="metrics" aria-label="Mission totals">
        {([['Active agents', counts.active], ['Total tasks', counts.tasks], ['Ready', counts.ready], ['In progress', counts.ongoing],
          ['Blocked', counts.blocked], ['Completed', counts.done], ['Failed', counts.failed]] as const).map(([label, value]) =>
          <div key={label}><dt>{label}</dt><dd>{String(value).padStart(2, '0')}</dd></div>)}
      </dl>

      <div className="workspace">
        <section className="board-panel panel" aria-labelledby="board-title">
          <div className="panel-heading">
            <div><div className="eyebrow">Formation</div><h2 id="board-title">Operations board</h2></div>
            <div className="panel-actions"><button aria-pressed={flat} title="Toggle flat rendering" onClick={() => setFlat(!flat)}><Layers size={15}/><span>{flat ? 'Flat' : 'Depth'}</span></button>
              <button title="Show or hide tasks" aria-pressed={showTasks} onClick={() => setShowTasks(!showTasks)}><ListFilter size={15}/><span>Tasks</span></button></div>
          </div>
          <div className="filters">
            <label className="search"><Search size={15}/><input aria-label="Search agents and tasks" value={search} placeholder="Search agents or tasks" onChange={event => { setSearch(event.target.value); if (event.target.value) setShowTasks(true) }}/></label>
            <select aria-label="Role" value={role} onChange={event => setRole(event.target.value)}><option value="">All roles</option>{roles.map(item => <option key={item}>{item}</option>)}</select>
            <select aria-label="Status" value={status} onChange={event => setStatus(event.target.value)}><option value="">All statuses</option>{statuses.map(item => <option key={item}>{item}</option>)}</select>
            <select aria-label="Channel" value={channel} onChange={event => setChannel(event.target.value)}><option value="">All channels</option>{channels.map(item => <option key={item}>{item}</option>)}</select>
            {missions.length > 0 && mode !== 'Demo' && <select aria-label="Mission" value={mission} onChange={event => setMission(event.target.value)}><option value="">All missions</option>{missions.map(item => <option key={item}>{item}</option>)}</select>}
          </div>
          <div className="board-region">
            <div className="rank-labels" aria-hidden="true">{squares.slice(0, 8).map(index => <span key={index}>{8 - index}</span>)}</div>
            <div className="board-with-files">
              <div className={'board ' + (flat ? 'flat' : '')} aria-label="Chessboard positions" style={{ '--move': (Math.round(540 / speed)) + 'ms' } as CSSProperties}
                onKeyDown={event => {
                  const offsets: Record<string, [number, number]> = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, 1], ArrowDown: [0, -1] }
                  const offset = offsets[event.key]
                  const id = (event.target as HTMLElement).closest<HTMLElement>('[data-piece]')?.dataset.piece
                  const piece = displayed.find(item => item.id === id)
                  const position = piece?.position
                  if (!offset || !position) return
                  event.preventDefault()
                  const nearby = displayed.filter(item => item.position && ((item.position.file - position.file) * offset[0] + (item.position.rank - position.rank) * offset[1]) > 0)
                    .sort((a, b) => Math.abs(a.position!.file - position.file) + Math.abs(a.position!.rank - position.rank) -
                      Math.abs(b.position!.file - position.file) - Math.abs(b.position!.rank - position.rank))
                  const target = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-piece]')].find(item => item.dataset.piece === nearby[0]?.id)
                  target?.focus()
                }}>
                <div className="tiles" aria-hidden="true">{squares.map(index => <i key={index} className={(index + Math.floor(index / 8)) % 2 ? 'dark-square' : 'light-square'}/>)}</div>
                {displayed.map(agent => <button key={agent.id} type="button" className={'piece ' + ((agent.position!.file + 7 - agent.position!.rank) % 2 ? 'on-dark' : 'on-light')}
                  style={{ '--x': agent.position!.file, '--y': 7 - agent.position!.rank } as CSSProperties}
                  data-piece={agent.id} aria-pressed={selected === agent.id && !taskId} onClick={() => selectAgent(agent, true)}
                  aria-label={agent.name + ', ' + pieceNames[agent.role] + ', ' + agent.status + ', ' + square(agent.position!) + (agent.queued ? ', move queued' : '')}>
                  <ChessPiece role={agent.role}/>
                  <span className="piece-label">{agent.name}</span>
                  {['Blocked', 'Failed'].includes(agent.status) && <span className="piece-flag">!</span>}
                  {agent.queued && <span className="piece-flag">…</span>}
                </button>)}
                {displayed.length === 0 && <div className="board-empty"><Crosshair size={20}/><strong>{query || role || status || channel ? 'No matching pieces' : idleTitle}</strong>
                  {mode !== 'Demo' && <small>{mode === 'Replay' && all.length ? 'Scrub the recorded timeline to show a position.' : feed.detail}</small>}</div>}
              </div>
              <div className="file-labels" aria-hidden="true">{[...files].map(file => <span key={file}>{file}</span>)}</div>
            </div>
            <div className="zones" aria-label="Rank zones">{['Delivery', 'Verification', 'Execution', 'Staging'].map(item => <span key={item}><i/>{item}</span>)}</div>
          </div>
          <div className="board-caption">
            <span><span className="mini-mark"/> {displayed.length} on board · {matching.length} matching{agents.some(agent => agent.queued) ? ' · moves queued' : ''}</span>
            <div>
              <button aria-label="Previous board" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}><ChevronLeft size={17}/></button>
              <span>Board {currentPage + 1} / {boards}</span>
              <button aria-label="Next board" disabled={currentPage >= boards - 1} onClick={() => setPage(currentPage + 1)}><ChevronRight size={17}/></button>
            </div>
          </div>
          {showTasks && <section className="task-list" aria-label="Tasks">
            {matchingTasks.length ? matchingTasks.map(({ task, event }) => <button key={event.taskId} onClick={() => {
              setTaskId(event.taskId ?? ''); inspectorNode.current?.scrollIntoView({ block: 'nearest' })
            }}><span>{task.title}</span><small>{task.state}</small><ChevronRight size={15}/></button>) : <p>No matching tasks.</p>}
          </section>}
          <div className="transport">
            <button className="play" aria-label={paused ? mode === 'Live' ? 'Resume visualization' : 'Play timeline' : mode === 'Live' ? 'Pause visualization' : 'Pause timeline'}
              onClick={togglePlayback} disabled={mode !== 'Live' && all.length === 0}>{paused ? <Play size={16} fill="currentColor"/> : <Pause size={17} fill="currentColor"/>}</button>
            {mode !== 'Live' ? <>
              <button aria-label="Restart timeline" className="restart" onClick={() => { setCursor(0); setPlaying(false) }}><RotateCcw size={15}/></button>
              <input aria-label="Timeline position" type="range" min="0" max={all.length} value={Math.min(end, all.length)} onChange={event => { setCursor(Number(event.target.value)); setPlaying(false) }}/>
              <span className="transport-time">{Math.min(end, all.length)} / {all.length}</span>
            </> : <div className="transport-time stretch">{paused ? 'Visualization paused' : feed.detail}</div>}
            <select aria-label="Animation and playback speed" value={speed} onChange={event => setSpeed(Number(event.target.value))}>
              {[0.5, 1, 1.5, 2, 4].map(value => <option key={value} value={value}>{value}×</option>)}
            </select>
          </div>
        </section>

        <aside className="side" aria-label="Agent details and activity">
          <section className="panel inspector" tabIndex={-1} ref={inspectorNode} aria-labelledby="inspector-title">
            <div className="side-heading"><span className="eyebrow"><Crosshair size={14}/> Inspector</span>
              {(inspected || inspectedTask) && <button aria-label="Close inspector details" onClick={() => { setSelected(''); setTaskId('') }}><X size={16}/></button>}
            </div>
            <Inspector state={state} events={scoped} agent={inspected} taskId={taskId} onTask={setTaskId} live={mode === 'Live'}/>
          </section>
          <section className="panel activity" aria-labelledby="activity-title">
            <div className="side-heading"><h2 id="activity-title"><Activity size={15}/> Activity</h2><span className="mono faint">{activity.length} events</span></div>
            {activity.length ? <ol>
              {activity.slice(Math.max(0, activityEnd - batchSize), activityEnd).reverse().map(event =>
                <li key={event.id}>
                  <div className="event-icon"><ArrowDownRight size={15}/></div>
                  <div className="event-body"><div><strong>{event.actor?.name ?? 'Board'}</strong> <span>{formatType(event.type)}</span></div>
                    <p>{event.task?.title || event.message?.text || event.actor?.id}</p>
                    {event.channelId && <small>#{event.channelId}</small>}{event.evidence === 'snapshot' && <small> · Snapshot</small>}
                  </div>
                  <time>{time(event.timestamp)}</time>
                </li>)}
            </ol> : <p className="empty-copy">Events appear here as the timeline advances.</p>}
            {activity.length > batchSize && <div className="activity-paging">
              {historyPage > 0 && <button className="load" onClick={() => setHistory(historyPage - 1)}><ChevronLeft size={14}/> Newer events</button>}
              {activityEnd > batchSize && <button className="load" onClick={() => setHistory(historyPage + 1)}>Earlier events <ArrowRight size={14}/></button>}
            </div>}
          </section>
        </aside>
      </div>
      <footer><span>Chessboard · {mode} mode</span><span>{current ? 'Timeline · ' + time(current.timestamp) + ' UTC' : feedBadge}</span></footer>
    </main>
  </>
}

function Inspector({ state, events, agent, taskId, onTask, live }: { state: State; events: Event[]; agent?: Piece; taskId: string; onTask: (id: string) => void; live: boolean }) {
  const assignment = state.tasks.get(taskId) ?? agent?.assignments[0]
  const task = assignment?.task
  const thread = assignment?.event.threadId
  const threadIds = new Set(agent?.assignments.flatMap(item => item.event.threadId ?? []) ?? [])
  if (thread) threadIds.add(thread)
  const related = [...state.messages.values()].filter(event => !event.message?.deleted &&
    (event.threadId && threadIds.has(event.threadId) || (agent && event.message?.authorId === agent.id)))
    .sort((a, b) => (b.message?.timestamp ?? 0) - (a.message?.timestamp ?? 0))
  const evidence = events.filter(event => (event.threadId && threadIds.has(event.threadId)) ||
    (agent && (event.actor?.id === agent.id || event.relatedAgents.includes(agent.id))))
  if (!agent && !assignment) return <div className="inspector-empty"><CircleHelp size={24}/><h2 id="inspector-title">Select an agent or task</h2><p>Explore assignments and the evidence behind each position.</p></div>
  const artifacts = [...new Map(related.flatMap(event => event.message?.artifacts ?? []).map(item => [item.id, item])).values()]
  const verification = [...new Set(evidence.flatMap(event => event.metadata?.verification ?? []))].reverse()
  const handoffIds = task?.needs.flatMap(id => state.tasks.get(id)?.agentId ?? []) ?? []
  const relatedIds = [...new Set([...handoffIds, ...evidence.flatMap(event => [event.actor?.id, ...event.relatedAgents])])]
    .filter((id): id is string => Boolean(id && state.agents.has(id) && id !== agent?.id))
  const links = [...new Set(related.flatMap(event => event.message?.links ?? []))]
  return <>
    <div className="identity">
      <div className="identity-piece"><ChessPiece role={agent?.role ?? 'Unmapped'}/></div>
      <div><div className="eyebrow">{agent && !taskId ? pieceNames[agent.role] + ' / ' + agent.role : 'Task details'}</div>
        <h2 id="inspector-title">{taskId ? task?.title : agent?.name}</h2></div>
      <span className="status-tag">{taskId ? task?.state : agent?.status}</span>
    </div>
    {agent && !taskId && <div className="identity-meta">
      <span className="mono" title={agent.id}>{agent.id}</span><span>{agent.position ? square(agent.position) : 'Unplaced'}{agent.queued ? ' · move queued' : ''}</span>
    </div>}
    <div className="inspect-content">
      <div className="assignment">
        <span className="eyebrow">{taskId ? 'Recorded assignment' : 'Primary assignment'}</span>
        <strong>{task?.title || 'No assignment observed'}</strong>
        {assignment && <small>#{assignment.event.channelId} / {thread} · {task?.state}</small>}
        {task?.note && <p>{task.note}</p>}
        {task?.leaseUntil && <small>Lease until {time(task.leaseUntil)} UTC</small>}
        {task?.needs.length ? <small>Depends on {task.needs.join(', ')}</small> : null}
      </div>
      <dl className="facts">
        <div><dt>Last activity</dt><dd>{agent?.lastSeen ? time(agent.lastSeen) + ' UTC' : 'Unavailable'}</dd></div>
        <div><dt>Blockers</dt><dd>{(agent?.assignments ?? (assignment ? [assignment] : []))
          .filter(item => item.task.state === 'blocked').map(item => item.task.note ?? item.task.title).join(', ') || 'None observed'}</dd></div>
        <div><dt>Related agents</dt><dd>{relatedIds.map(id => state.agents.get(id)?.name).join(', ') || 'Unavailable'}</dd></div>
      </dl>
      {agent && agent.assignments.length > 1 && <details><summary>Additional assignments ({agent.assignments.length - 1})</summary>
        {agent.assignments.slice(1).map(item => <button className="plain-link" key={item.event.id} onClick={() => onTask(item.event.taskId ?? '')}>{item.task.title} · {item.task.state}</button>)}
      </details>}
      <details><summary>Recent messages ({related.length})</summary>
        {related.slice(0, 10).map(event => <p key={event.message?.id}><small>{state.agents.get(event.message?.authorId ?? '')?.name ?? event.message?.authorId} · {time(event.message?.timestamp)}</small><br/>{event.message?.text}</p>)}
        {!related.length && <p>Unavailable.</p>}
      </details>
      <details><summary>Task history</summary>
        {evidence.filter(event => event.task).slice(-12).reverse().map(event => <p key={event.id}>{time(event.timestamp)} · {formatType(event.type)} · {event.task?.title}</p>)}
        {!evidence.some(event => event.task) && <p>Unavailable.</p>}
      </details>
      <details><summary>Artifacts and verification</summary>
        {artifacts.map(artifact => <p key={artifact.id}>{artifact.name} <small>{artifact.id}</small></p>)}
        {verification.map(result => <p key={result}>{result}</p>)}
        {!artifacts.length && !verification.length && <p>Unavailable.</p>}
      </details>
      <ThreadEvidence key={String(live) + thread} thread={thread} links={links} live={live}/>
    </div>
  </>
}
