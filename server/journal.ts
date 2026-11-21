import { DatabaseSync } from 'node:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import type { Event } from '../src/domain.ts'

export function openJournal(path: string) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const db = new DatabaseSync(path)
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY, scope TEXT NOT NULL, id TEXT NOT NULL, body TEXT NOT NULL, UNIQUE(scope,id)
    );
    CREATE INDEX IF NOT EXISTS scope_sequence ON events(scope,seq);
    CREATE TABLE IF NOT EXISTS checkpoints (scope TEXT PRIMARY KEY, cursor TEXT NOT NULL);
  `)
  const select = db.prepare('SELECT seq,body FROM events WHERE scope=? AND seq>? ORDER BY seq LIMIT ?')
  const insert = db.prepare('INSERT OR IGNORE INTO events(scope,id,body) VALUES (?,?,?)')
  const checkpoint = db.prepare('INSERT INTO checkpoints(scope,cursor) VALUES (?,?) ON CONFLICT(scope) DO UPDATE SET cursor=excluded.cursor')
  const getCursor = db.prepare('SELECT cursor FROM checkpoints WHERE scope=?')
  return {
    append(scope: string, events: Event[], cursor: string) {
      db.exec('BEGIN IMMEDIATE')
      try {
        for (const event of events) {
          if (event.source !== 'board') throw new Error('Only Board observations belong in the live journal.')
          insert.run(scope, event.id, JSON.stringify(event))
        }
        checkpoint.run(scope, cursor)
        db.exec('COMMIT')
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    },
    read(scope: string, after: number, limit: number): Event[] {
      return select.all(scope, after, limit).map(row => ({ ...JSON.parse(String(row.body)), order: Number(row.seq) }))
    },
    cursor(scope: string): string | undefined {
      return getCursor.get(scope)?.cursor as string | undefined
    },
    close: () => db.close(),
  }
}
export type Journal = ReturnType<typeof openJournal>
