import type { Actor, Event, Role, Task, TaskState } from './domain.ts'

export const demoMission = 'Release the workspace search'
const start = Date.UTC(2026, 10, 21, 14, 30)
const agents: Actor[] = ([
  ['marshal', 'Marshal', 'Commander'], ['tempo', 'Tempo', 'Orchestrator'],
  ['forge', 'Forge', 'Builder'], ['anvil', 'Anvil', 'Builder'],
  ['probe', 'Probe', 'Specialist'], ['audit', 'Audit', 'Reviewer'],
  ['relay', 'Relay', 'Worker'], ['patch', 'Patch', 'Worker'],
] as [string, string, Role][]).map(([id, name, role]) => ({ id: 'demo:' + id, name, role, kind: 'fixture' }))

const tasks = {
  T1: { title: 'Define the search release', channel: 'mission', needs: [], agent: 0 },
  T2: { title: 'Split the search rollout', channel: 'mission', needs: ['T1'], agent: 1 },
  T3: { title: 'Build the indexing API', channel: 'engineering', needs: ['T2'], agent: 2 },
  T4: { title: 'Implement search results', channel: 'engineering', needs: ['T2'], agent: 3 },
  T5: { title: 'Investigate the tokenizer dependency', channel: 'engineering', needs: ['T2'], agent: 4 },
  T6: { title: 'Verify search against release criteria', channel: 'verification', needs: ['T3', 'T4', 'T5'], agent: 5, step: 'review' },
  T7: { title: 'Package release notes', channel: 'mission', needs: ['T6'], agent: 6 },
  T8: { title: 'Correct keyboard focus after navigation', channel: 'engineering', needs: [], agent: 7 },
} as const

const events: Event[] = []
function add(type: string, actor?: Actor, key?: keyof typeof tasks, text = '', state?: TaskState) {
  const order = events.length + 1
  const timestamp = start + (order - 1) * 1500
  const spec = key ? tasks[key] : undefined
  const task: Task | undefined = state && spec ? {
    title: spec.title, state, owner: agents[1].id, assignee: agents[spec.agent].id,
    holder: state === 'claimed' ? agents[spec.agent].id : null, leaseUntil: null,
    needs: [...spec.needs], note: text, step: 'step' in spec ? spec.step : undefined,
  } : undefined
  const threadId = key ?? (type === 'actor.seen' ? undefined : 'M1')
  const label = { mission: demoMission }
  events.push({
    id: 'demo:' + order, source: 'demo', sourceEventId: String(order), boardId: 'demo',
    channelId: spec?.channel ?? (threadId ? 'mission' : undefined), threadId, taskId: task ? key : undefined,
    actor, type, timestamp, order, evidence: 'simulated', task,
    relatedAgents: spec ? [agents[spec.agent].id] : [], metadata: {
      mission: demoMission,
      verification: type === 'task.failed' && key === 'T6' ? 'Failed · keyboard focus regression'
        : type === 'task.completed' && key === 'T6' ? 'Passed · keyboard, indexing and search acceptance' : undefined,
    },
    message: threadId ? {
      id: task || order === 9 ? threadId : 'reply:' + order, authorId: actor?.id ?? agents[1].id,
      timestamp, version: order, text: task ? task.title : text, deleted: false, labels: label,
      artifacts: key === 'T6' && ['task.failed', 'task.completed'].includes(type)
        ? [{ id: 'demo:verification:' + order, name: 'search-acceptance.txt' }] : [], links: [],
    } : undefined,
  })
}
const transition = (key: keyof typeof tasks, state: TaskState, text: string, type = 'task.' + state) =>
  add(type, agents[tasks[key].agent], key, text, state)

for (const agent of agents) add('actor.seen', agent)
add('message.posted', agents[0], undefined, 'Mission received: ship workspace search with keyboard navigation and reproducible acceptance checks.')
transition('T1', 'ready', 'Mission accepted.', 'task.created')
transition('T1', 'claimed', 'Defining release criteria.')
transition('T1', 'completed', 'Release criteria approved.')
transition('T2', 'ready', 'Work breakdown requested.', 'task.created')
transition('T2', 'claimed', 'Splitting indexing, interface, and dependency tracks.')
for (const key of ['T3', 'T4', 'T5', 'T6', 'T7'] as const) transition(key, 'waiting', 'Dependencies recorded.', 'task.created')
transition('T2', 'completed', 'Three execution tracks and an independent review are scheduled.')
for (const key of ['T3', 'T4', 'T5'] as const) {
  transition(key, 'ready', 'Planning dependency satisfied.')
  transition(key, 'claimed', 'Work started.')
}
add('message.posted', agents[4], 'T5', 'Tokenizer version is pinned. Checking its output on accented filenames.')
transition('T5', 'completed', 'Dependency is compatible with the indexed fixtures.')
transition('T3', 'completed', 'Indexing API returns deterministic rankings.')
transition('T4', 'completed', 'Search interface is ready for review.')
transition('T6', 'ready', 'All implementation dependencies completed.')
transition('T6', 'claimed', 'Checking the release against the acceptance contract.')
export const demoPreview = events.length
transition('T6', 'failed', 'Keyboard focus is lost after returning from a result.')
transition('T8', 'ready', 'Fix requested after failed acceptance test.', 'task.created')
transition('T8', 'claimed', 'Reproduced focus loss and added a regression test.')
transition('T8', 'completed', 'Search field focus restored after navigation.')
transition('T6', 'ready', 'Correction is available for a second review.', 'task.reopened')
transition('T6', 'claimed', 'Running independent acceptance again.')
transition('T6', 'completed', 'All acceptance checks passed.')
transition('T7', 'ready', 'Verification dependency satisfied.')
transition('T7', 'claimed', 'Assembling the verified release notes.')
transition('T7', 'completed', 'Release notes reference the acceptance report.')
add('message.posted', agents[0], undefined, 'Mission complete. Search, indexing, and keyboard acceptance passed after the follow-up fix.')
export const demoEvents = events
