import assert from 'node:assert/strict'
import { test } from 'node:test'
import { performance } from 'node:perf_hooks'
import { advance, nextLeaseExpiry, project, refreshAt, square, visibleInMission } from '../src/domain.ts'
import type { Event, TaskState } from '../src/domain.ts'
import { demoEvents, demoMission, demoPreview } from '../src/demo.ts'

function observation(order: number, agent: string, id?: string, state: TaskState = 'claimed', step?: string): Event {
  return {
    id: String(order), source: 'board', sourceEventId: String(order), boardId: 'test', channelId: 'build',
    threadId: id, taskId: id, timestamp: order * 1000, order, evidence: 'observed',
    actor: { id: agent, kind: 'agent', name: 'Shared display name' },
    type: id ? 'task.' + state : 'actor.seen', relatedAgents: [],
    task: id ? {
      state, title: id, owner: 'lead', holder: state === 'claimed' ? agent : null, assignee: null,
      leaseUntil: state === 'claimed' ? 1_000_000 : null, needs: [], note: null, step,
    } : undefined,
  }
}

test('64+ stable identities get unique squares across overflow boards', () => {
  for (const count of [1, 8, 16, 32, 64, 96]) {
    const events = Array.from({ length: count }, (_, i) => observation(i + 1, 'actor-' + i))
    const state = project(events)
    assert.deepEqual(project([...events].reverse()), state)
    const slots = [...state.agents.values()].map(({ position }) => position!.board + ':' + square(position!))
    assert.equal(new Set(slots).size, count)
    assert.equal(state.agents.get('actor-0')?.status, 'Unknown')
  }
})

test('moves by task stage, keeps blocked agents stationary, and recovers from expiration', () => {
  const seen = observation(1, 'agent')
  const claimed = observation(2, 'agent', 'build')
  const blocked = observation(3, 'agent', 'build', 'blocked')
  const reviewed = observation(4, 'agent', 'build', 'claimed', 'review')
  const done = observation(5, 'agent', 'build', 'completed', 'review')
  const position = (events: Event[]) => project(events).agents.get('agent')!
  assert.equal(position([seen, claimed]).position?.rank, 2)
  assert.equal(position([seen, claimed, blocked]).status, 'Blocked')
  assert.deepEqual(position([seen, claimed, blocked]).position, position([seen, claimed]).position)
  assert.equal(position([seen, claimed, blocked, reviewed]).position?.rank, 4)
  assert.equal(position([seen, claimed, reviewed, done]).position?.rank, 6)
  assert.equal(project([seen, claimed], 1_000_000).agents.get('agent')?.status, 'Unknown')
})

test('a full destination queues movement and a subsequent vacated slot is reused', () => {
  const events = Array.from({ length: 16 }, (_, i) => observation(i + 1, 'a' + i, 't' + i))
  events.push(observation(17, 'queued'), observation(18, 'queued', 'later'))
  const waiting = project(events).agents.get('queued')!
  assert.equal(waiting.queued, true)
  assert.equal(waiting.position?.rank, 0)
  const next = project(events.concat(observation(19, 'a0', 't0', 'completed'))).agents.get('queued')!
  assert.equal(next.queued, false)
  assert.equal(next.position?.rank, 2)
})

test('multiple tasks keep one primary and stale versions cannot overwrite newer evidence', () => {
  const first = observation(1, 'agent', 't1')
  const second = observation(2, 'agent', 't2')
  const done = observation(3, 'agent', 't1', 'completed')
  const view = { id: 't1', authorId: 'agent', text: 'build', deleted: false, timestamp: 0, labels: {}, artifacts: [], links: [] }
  done.message = { ...view, version: 10 }
  const stale = { ...first, order: 4, id: 'stale', message: { ...view, version: 1 } }
  const state = project([stale, done, second, first, first])
  assert.equal(state.tasks.get('t1')?.task.state, 'completed')
  assert.deepEqual(state.agents.get('agent')?.assignments.map(item => item.event.taskId), ['t2', 't1'])
  assert.equal(state.agents.size, 1)
})

test('demo has deterministic scrubbing, failure and corrected verification', () => {
  const early = demoEvents.slice(0, demoPreview)
  assert.equal(project(early).agents.get('demo:audit')?.status, 'Verifying')
  assert.ok(demoEvents.some(event => event.type === 'task.failed'))
  assert.ok(demoEvents.some(event => event.type === 'task.reopened'))
  const projected = project(demoEvents)
  assert.equal(projected.tasks.get('T6')?.task.state, 'completed')
  assert.ok([...projected.tasks.values()].every(task => task.task.state === 'completed'))
  assert.deepEqual(advance(project(early), demoEvents.slice(demoPreview)), projected)
  assert.equal(visibleInMission(demoEvents, demoMission).length, demoEvents.length)
  assert.equal(visibleInMission(demoEvents, 'another').length, 0)
})

test('processes burst messages and rapid task changes within a responsive budget', () => {
  const events = Array.from({ length: 64 }, (_, i) => observation(i + 1, 'agent' + i))
  for (let index = 0; index < 1000; index++) {
    events.push(observation(events.length + 1, 'agent' + index % 64))
    if (index % 5 === 0) {
      const name = 'agent' + index % 64
      events.push(observation(events.length + 1, name, name), observation(events.length + 2, name, name, 'completed'))
    }
  }
  const before = performance.now()
  const state = project(events)
  assert.equal(state.agents.size, 64)
  assert.ok(performance.now() - before < 2000)
})

test('a reconciled snapshot clears stale current state while earlier playback is preserved', () => {
  const before = observation(1, 'old', 'missing')
  const reset: Event = { ...observation(2, 'old'), type: 'snapshot.reconciled', actor: undefined, evidence: 'snapshot' }
  const after = { ...observation(3, 'new'), evidence: 'snapshot' as const }
  assert.equal(project([before]).tasks.size, 1)
  const current = project([before, reset, after])
  assert.equal(current.tasks.size, 0)
  assert.deepEqual([...current.agents.keys()], ['new'])
})

test('idle lease refresh reuses the projection until a live claim actually expires', () => {
  const seen = observation(1, 'agent')
  const claimed = observation(2, 'agent', 'job')
  const state = project([seen, claimed])
  const deadline = claimed.task!.leaseUntil!
  assert.equal(nextLeaseExpiry(state, claimed.timestamp), deadline)
  assert.equal(refreshAt(state, deadline - 1, claimed.timestamp), state)
  assert.equal(refreshAt(state, deadline, claimed.timestamp).agents.get('agent')?.status, 'Unknown')
  assert.equal(nextLeaseExpiry(state, deadline), undefined)
})
