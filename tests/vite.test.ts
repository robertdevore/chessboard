import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { basename, join, resolve } from 'node:path'
import { test } from 'node:test'
import { createServer } from 'vite'
import { privateStorage } from '../server/storagePaths.ts'

test('development server denies private storage even when files use custom extensions', async () => {
  const directory = mkdtempSync(resolve('.storage-test-'))
  const journal = join(directory, 'custom.[journal].txt')
  const runs = join(directory, 'runs')
  mkdirSync(runs)
  writeFileSync(journal, 'journal')
  writeFileSync(journal + '-wal', 'sidecar')
  writeFileSync(join(runs, 'example.json'), '{}')
  process.env.CHESSBOARD_DB = journal
  process.env.CHESSBOARD_RUNLEDGER_DIR = directory
  process.env.BOARD_URL = ''
  process.env.CHESSBOARD_TEAM = ''
  process.env.VERCEL_ORG_ID = ''
  process.env.CHESSBOARD_LIVE = ''
  const server = await createServer({ logLevel: 'silent', server: { port: 0, hmr: false } })
  try {
    await server.listen()
    const address = server.httpServer?.address()
    assert.ok(address && typeof address !== 'string')
    const origin = 'http://127.0.0.1:' + address.port
    assert.equal((await fetch(origin + '/mark.svg')).status, 200)
    for (const path of [encodeURIComponent(basename(journal)), encodeURIComponent(basename(journal)) + '-wal', 'runs/example.json']) {
      assert.equal((await fetch(origin + '/' + basename(directory) + '/' + path)).status, 403)
    }
  } finally {
    await server.close()
    rmSync(directory, { recursive: true })
  }
})

test('storage cannot live under a served directory or reach it through an alias', () => {
  assert.throws(() => privateStorage({ CHESSBOARD_DB: 'dist/observations.txt' }, ['dist']), /outside/)
  if (process.platform === 'win32') return
  const directory = mkdtempSync(resolve('.storage-test-'))
  try {
    symlinkSync(resolve('public'), join(directory, 'served'), 'dir')
    assert.throws(() => privateStorage({ CHESSBOARD_DB: join(directory, 'served', 'observations.txt') }, ['public']), /outside/)
  } finally {
    rmSync(directory, { recursive: true })
  }
})
