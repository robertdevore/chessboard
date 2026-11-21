export const roles = ['Commander', 'Orchestrator', 'Builder', 'Reviewer', 'Specialist', 'Worker', 'Unmapped'] as const
export type Role = typeof roles[number]
export type Source = 'board' | 'demo' | 'kujo'
export type Status = 'Unknown' | 'Staged' | 'Executing' | 'Verifying' | 'Blocked' | 'Delivered' | 'Failed'
export type TaskState = 'waiting' | 'ready' | 'claimed' | 'blocked' | 'completed' | 'failed' | 'canceled'
export type Actor = { id: string; name: string; kind: string; via?: string; role?: Role }
export type Artifact = { id: string; name: string }
export type Message = {
  id: string; authorId: string; version: number; text: string; deleted: boolean; timestamp: number
  labels: Record<string, string>; artifacts: Artifact[]; links: string[]
}
export type Task = {
  state: TaskState; title: string; owner: string; assignee: string | null; holder: string | null
  leaseUntil: number | null; needs: string[]; note: string | null; step?: string
}
export type Event = {
  id: string; source: Source; sourceEventId: string; boardId: string; channelId?: string; threadId?: string
  taskId?: string; actor?: Actor; type: string; timestamp: number; order: number
  evidence: 'observed' | 'snapshot' | 'simulated'; task?: Task; relatedAgents: string[]
  message?: Message; metadata?: { verification?: string; mission?: string; mentions?: string[] }
}
export type Position = { board: number; rank: number; file: number }
export type Assignment = { event: Event; task: Task; agentId?: string }
export type Piece = Actor & {
  role: Role; status: Status; position?: Position; queued: boolean; lastSeen?: number
  assignments: Assignment[]; channel?: string
}
export type State = {
  agents: Map<string, Piece>; tasks: Map<string, Assignment>; messages: Map<string, Event>
}

export const files = 'abcdefgh'
export const square = (position: Position) => files[position.file] + (position.rank + 1)
export const emptyState = (): State => ({ agents: new Map(), tasks: new Map(), messages: new Map() })
const ordinal = (a: string, b: string) => a === b ? 0 : a < b ? -1 : 1
export const compareEvents = (a: Event, b: Event) => a.order - b.order || a.timestamp - b.timestamp || ordinal(a.id, b.id)
export const sortEvents = (events: Event[]) => [...new Map(events.map(event => [event.id, event])).values()].sort(compareEvents)
const zone = (status: Status) => status === 'Executing' ? 1 : status === 'Verifying' ? 2 : status === 'Delivered' ? 3 : 0
const slotKey = ({ board, rank, file }: Position) => board * 64 + rank * 8 + file
const fileOrder = [4, 3, 2, 5, 1, 6, 0, 7]
const priority: Record<TaskState, number> = { claimed: 0, blocked: 1, ready: 2, waiting: 2, failed: 3, completed: 4, canceled: 5 }

function statusFor(assignment: Assignment | undefined, time: number, staged: boolean): Status {
  switch (assignment?.task.state) {
    case 'claimed':
      if (assignment.task.leaseUntil !== null && assignment.task.leaseUntil <= time) return 'Unknown'
      return assignment.task.step === 'review' ? 'Verifying' : 'Executing'
    case 'blocked': return 'Blocked'
    case 'completed': return 'Delivered'
    case 'failed': return 'Failed'
    case 'ready':
    case 'waiting': return 'Staged'
    default: return staged ? 'Staged' : 'Unknown'
  }
}

function allocate(agents: Map<string, Piece>) {
  const occupied = new Set([...agents.values()].flatMap(agent => agent.position ? [slotKey(agent.position)] : []))
  for (const agent of agents.values()) {
    const position = agent.position
    const preserve = agent.status === 'Blocked' || agent.status === 'Failed' || agent.status === 'Unknown'
    if (position && (preserve || Math.floor(position.rank / 2) === zone(agent.status))) {
      agent.queued = false
      continue
    }
    const preferredBoard = position?.board ?? 0
    const evenRank = zone(agent.status) * 2
    const boards = position ? [preferredBoard] : Array.from({ length: agents.size + 1 }, (_, i) => i)
    let target: Position | undefined
    for (const board of boards) {
      const slots = [evenRank, evenRank + 1].flatMap(rank => fileOrder.map(file => ({ board, rank, file })))
      target = slots.find(slot => !occupied.has(slotKey(slot)))
      if (target) break
    }
    agent.queued = !target
    if (target) {
      if (position) occupied.delete(slotKey(position))
      occupied.add(slotKey(target))
      agent.position = target
    }
  }
}

export function project(events: Event[], now?: number, mapping: Record<string, Role> = {}): State {
  return advance(emptyState(), sortEvents(events), now, mapping)
}

export function advance(state: State, events: Event[], now?: number, mapping: Record<string, Role> = {}): State {
  const agents = new Map([...state.agents].map(([id, agent]) => [id, { ...agent }]))
  const tasks = new Map(state.tasks)
  const messages = new Map(state.messages)
  const sync = (time: number) => {
    const assignments = new Map<string, Assignment[]>()
    for (const task of tasks.values()) {
      if (!task.agentId) continue
      const items = assignments.get(task.agentId) ?? []
      items.push(task)
      assignments.set(task.agentId, items)
    }
    for (const agent of agents.values()) {
      agent.role = mapping[agent.id] ?? agent.role
      agent.assignments = (assignments.get(agent.id) ?? []).sort((a, b) =>
        (statusFor(a, time, false) === 'Unknown' ? 6 : priority[a.task.state]) -
        (statusFor(b, time, false) === 'Unknown' ? 6 : priority[b.task.state]) ||
        Number(b.event.taskId === agent.assignments[0]?.event.taskId) -
        Number(a.event.taskId === agent.assignments[0]?.event.taskId) ||
        compareEvents(b.event, a.event))
      agent.status = statusFor(agent.assignments[0], time, agent.kind === 'fixture')
    }
    // A moved piece can free a square for a previously queued piece.
    allocate(agents)
    if ([...agents.values()].some(agent => agent.queued)) allocate(agents)
  }

  for (const event of events) {
    const actor = event.actor
    if (actor && (['agent', 'profile', 'fixture', 'workflow', 'deployment'].includes(actor.kind) || Object.hasOwn(mapping, actor.id) || agents.has(actor.id))) {
      const known = agents.get(actor.id)
      agents.set(actor.id, {
        ...actor, name: actor.kind === 'unknown' ? known?.name ?? actor.name : actor.name,
        kind: actor.kind === 'unknown' ? known?.kind ?? actor.kind : actor.kind, role: mapping[actor.id] ?? actor.role ?? known?.role ?? 'Unmapped',
        status: known?.status ?? 'Unknown', position: known?.position, queued: known?.queued ?? false,
        assignments: known?.assignments ?? [], channel: event.channelId ?? known?.channel,
        lastSeen: event.evidence === 'snapshot' ? known?.lastSeen : Math.max(event.timestamp, known?.lastSeen ?? 0),
      })
    }
    if (event.message) {
      const previous = messages.get(event.message.id)
      if (!previous?.message || previous.message.version <= event.message.version) messages.set(event.message.id, event)
    }
    if (event.message?.deleted && !event.task && event.threadId && event.message.id === event.threadId) {
      const previous = tasks.get(event.threadId)
      if (previous && (previous.event.message?.version ?? 0) <= event.message.version) {
        tasks.set(event.threadId, { event: { ...event, taskId: event.threadId },
          task: { ...previous.task, state: 'canceled', title: 'Deleted task', note: null, holder: null, leaseUntil: null } })
        sync(event.timestamp)
      }
    }
    if (event.taskId && event.task) {
      const previous = tasks.get(event.taskId)
      if (!previous || (previous.event.message?.version ?? 0) <= (event.message?.version ?? 0)) {
        const task = event.task
        const retainsHolder = ['blocked', 'completed', 'failed'].includes(task.state)
        const settles = event.evidence !== 'snapshot' && ['task.completed', 'task.failed'].includes(event.type)
        const agentId = task.holder ?? (retainsHolder ? previous?.agentId ?? (settles ? actor?.id : undefined) : undefined) ?? task.assignee ?? undefined
        tasks.set(event.taskId, { event, task, agentId })
      }
      sync(event.timestamp)
    } else if (actor && !agents.get(actor.id)?.position) {
      sync(event.timestamp)
    }
  }
  sync(now ?? events.at(-1)?.timestamp ?? 0)
  return { agents, tasks, messages }
}

export function visibleInMission(events: Event[], mission: string) {
  if (!mission) return events
  const threads = new Set<string>()
  const labels = new Map<string, Event>()
  for (const event of events) {
    if (!event.message || event.message.id !== event.threadId) continue
    const previous = labels.get(event.message.id)?.message
    if (!previous || event.message.version >= previous.version) labels.set(event.message.id, event)
  }
  for (const event of labels.values()) {
    if (!event.message?.deleted && event.metadata?.mission === mission && event.threadId) threads.add(event.threadId)
  }
  const agentIds = new Set(events.filter(event => event.threadId && threads.has(event.threadId))
    .flatMap(event => [event.actor?.id, ...event.relatedAgents]))
  return events.filter(event => event.threadId ? threads.has(event.threadId) : agentIds.has(event.actor?.id))
}
