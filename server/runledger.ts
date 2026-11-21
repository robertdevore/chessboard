import { constants } from 'node:fs'
import { open, realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

export type Receipt = { id: string; task: string; status: string; model: string; updated: string; testCount: number }

export async function readReceipt(directory: string, id: string): Promise<Receipt | undefined> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(id)) return
  try {
    const root = await realpath(directory)
    const runs = await realpath(resolve(root, 'runs'))
    if (!runs.startsWith(root + sep)) return
    const path = resolve(runs, id + '.json')
    if (!constants.O_NOFOLLOW && await realpath(path) !== path) return
    const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK)
    try {
      const info = await file.stat()
      if (!info.isFile() || info.size > 1_048_576) return
      const bytes = Buffer.alloc(info.size + 1)
      let offset = 0
      while (offset < bytes.length) {
        const { bytesRead } = await file.read(bytes, offset, bytes.length - offset, offset)
        if (!bytesRead) break
        offset += bytesRead
      }
      if (offset !== info.size) return
      const value = JSON.parse(bytes.toString('utf8', 0, offset))
      if (!value || value.id !== id || typeof value.task_name !== 'string' || typeof value.model !== 'string' ||
        !['in_progress', 'pass', 'partial', 'fail', 'abandoned'].includes(value.status) || !Number.isFinite(Date.parse(value.updated_at))) return
      return { id, task: value.task_name, status: value.status, model: value.model,
        updated: value.updated_at, testCount: Array.isArray(value.tests) ? value.tests.length : 0 }
    } finally {
      await file.close()
    }
  } catch {
    return undefined
  }
}
