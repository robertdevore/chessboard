import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createServer } from 'node:http'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, statSync, symlinkSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { board } from '@vercel/board'
import { local } from '@vercel/board/backend-local'
import { createApi } from '../server/api.ts'
import { collect } from '../server/collector.ts'
import { openJournal } from '../server/journal.ts'
import { readReceipt } from '../server/runledger.ts'
import { demoEvents } from '../src/demo.ts'
import { project } from '../src/domain.ts'

test('official local Board: bootstrap, leases, replies, completion, and cursor recovery', async () => {
  const backend = local({ memory: true })
  const team = board({ backend })
  const runner = team.as('reviewer')
  const { task: created } = await team.tasks.create('release', { text: 'Review release', labels: { mission: 'Release', step: 'review' } })
  const db = openJournal(':memory:')
  let collector = collect(team, db, 'test', 'release')
  async function until(predicate: () => boolean) {
    const limit = Date.now() + 10_000
    while (!predicate()) {
      assert.ok(Date.now() < limit, JSON.stringify(collector.view()))
      await sleep(25)
    }
  }
  const events = () => db.read(collector.view().scope ?? '', 0, 500)
  try {
    await until(() => events().some(event => event.evidence === 'snapshot' && event.task?.state === 'ready'))
    const claim = await runner.tasks.claim(created.id)
    await until(() => events().some(event => event.type === 'task.claimed'))
    const identity = (await runner.me()).actor
    assert.equal(project(events()).agents.get(identity)?.status, 'Verifying')
    const held = claim
    await held.renew()
    await runner.reply(created.id, 'Independent test evidence.')
    await until(() => events().some(event => event.type === 'task.renewed') && events().some(event => event.type === 'message.posted'))
    await collector.close()
    await held.complete('Accepted')
    collector = collect(team, db, 'test', 'release')
    await until(() => events().some(event => event.type === 'task.completed'))
    const recorded = events()
    assert.equal(project(recorded).agents.get(identity)?.status, 'Delivered')
    assert.equal(project(recorded).tasks.get(created.id)?.task.note, 'Accepted')
    assert.equal(new Set(recorded.map(event => event.id)).size, recorded.length)
    assert.ok(recorded.every(event => event.source === 'board'))
    assert.ok(recorded.every(event => !JSON.stringify(event).includes(claim.token)))
  } finally {
    await collector.close()
    db.close()
    await backend.close()
  }
})

test('live journal stays private, rejects demo data, and isolates checkpoint scopes', () => {
  const root = mkdtempSync(join(tmpdir(), 'chessboard-journal-'))
  const path = join(root, 'journal.sqlite')
  const db = openJournal(path)
  try {
    if (process.platform !== 'win32') assert.equal(statSync(path).mode & 0o777, 0o600)
    assert.throws(() => db.append('live', demoEvents, 'fixture', undefined), /Only Board/)
    const event = { ...demoEvents[0], source: 'board' as const, evidence: 'observed' as const }
    db.append('A', [event, event], 'cursor', undefined)
    assert.equal(db.read('A', 0, 10).length, 1)
    assert.equal(db.read('B', 0, 10).length, 0)
    assert.equal(db.cursor('A'), 'cursor')
  } finally {
    db.close()
    rmSync(root, { recursive: true })
  }
})

test('loopback API rejects writes and cross-origin access', async () => {
  const api = createApi({})
  const server = createServer((req, res) => api.route(req, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const url = 'http://127.0.0.1:' + address.port + '/api/events'
  try {
    assert.equal((await fetch(url, { method: 'POST' })).status, 405)
    assert.equal((await fetch(url, { headers: { Origin: 'https://external.example' } })).status, 403)
    assert.equal((await fetch(url, { headers: { 'Sec-Fetch-Site': 'same-site' } })).status, 403)
    const response = await fetch(url)
    const data = await response.json()
    assert.equal(data.status, 'off')
    assert.deepEqual(data.events, [])
    assert.equal((await fetch(url.replace('/events', '/thread-evidence/1'))).status, 503)
  } finally {
    server.close()
    await Promise.all([api.close(), api.close()])
  }
})

test('RunLedger adapter reads only a bounded receipt inside the configured directory', async () => {
  const root = mkdtempSync(join(tmpdir(), 'chessboard-receipt-'))
  try {
    mkdirSync(join(root, 'runs'))
    writeFileSync(join(root, 'runs/record.json'), JSON.stringify({
      id: 'record', task_name: 'Verification', status: 'pass', model: 'agent',
      updated_at: '2026-11-21T10:00:00Z', tests: [{}], repo_path: '/private/path',
    }))
    assert.deepEqual(await readReceipt(root, 'record'), {
      id: 'record', task: 'Verification', status: 'pass', model: 'agent', updated: '2026-11-21T10:00:00Z', testCount: 1,
    })
    assert.equal(await readReceipt(root, '../record'), undefined)
    writeFileSync(join(root, 'runs', 'large.json'), Buffer.alloc(1_048_577))
    assert.equal(await readReceipt(root, 'large'), undefined)
    if (process.platform !== 'win32') {
      symlinkSync(join(root, 'runs', 'record.json'), join(root, 'runs', 'alias.json'))
      assert.equal(await readReceipt(root, 'alias'), undefined)
    }
  } finally {
    rmSync(root, { recursive: true })
  }
})

test('a stale worker cannot overwrite a checkpoint or append out-of-order observations', () => {
  const root = mkdtempSync(join(tmpdir(), 'chessboard-checkpoint-'))
  const writer = openJournal(join(root, 'shared.sqlite'))
  const slow = openJournal(join(root, 'shared.sqlite'))
  const event = { ...demoEvents[0], source: 'board' as const, evidence: 'observed' as const }
  try {
    assert.equal(writer.append('A', [event], 'head', undefined), true)
    const previous = slow.cursor('A')
    assert.equal(writer.append('A', [], 'new-head', previous), true)
    assert.equal(slow.append('A', [{ ...event, id: 'stale' }], 'stale-head', previous), false)
    assert.equal(slow.append('A', [], 'new-head', 'new-head'), true)
    assert.equal(slow.cursor('A'), 'new-head')
    assert.deepEqual(slow.read('A', 0, 10).map(item => item.id), [event.id])
  } finally {
    slow.close()
    writer.close()
    rmSync(root, { recursive: true })
  }
})

test('event API restarts an obsolete offset while leaving ordinary cursors intact', async () => {
  const backend = local({ memory: true })
  const team = board({ backend })
  await team.post('release', 'Initial observation')
  const api = createApi({ CHESSBOARD_LIVE: '1', CHESSBOARD_DB: ':memory:' }, () => team)
  const server = createServer((req, res) => api.route(req, res))
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  assert.ok(address && typeof address !== 'string')
  const url = 'http://127.0.0.1:' + address.port + '/api/events'
  const read = async (query = '') => (await fetch(url + query)).json()
  try {
    let page = await read()
    const deadline = Date.now() + 5000
    while (!page.events.length) {
      assert.ok(Date.now() < deadline, JSON.stringify(page))
      await sleep(25)
      page = await read()
    }
    const last = page.events.at(-1)
    const query = '?scope=' + page.scope + '&after=' + last.order + '&seen='
    const valid = await read(query + encodeURIComponent(last.id))
    assert.deepEqual(valid.events, [])
    assert.equal(valid.reset, undefined)
    const restored = await read(query + 'obsolete')
    assert.equal(restored.reset, true)
    assert.deepEqual(restored.events, page.events)
  } finally {
    server.close()
    await api.close()
    await backend.close()
  }
})

test('Board URL credentials must use the separate server token setting', () => {
  assert.throws(() => createApi({ BOARD_URL: 'https://board.example/?token=placeholder' }), /BOARD_TOKEN/)
})
