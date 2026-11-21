import { lstat, readFile, realpath } from 'node:fs/promises'
import { resolve, sep } from 'node:path'

export type Receipt = { id: string; task: string; status: string; model: string; updated: string; testCount: number }

export async function readReceipt(directory: string, id: string): Promise<Receipt | undefined> {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,159}$/.test(id)) return
  try {
    const root = await realpath(directory)
    const path = resolve(root, 'runs', id + '.json')
    const [info, target] = await Promise.all([lstat(path), realpath(path)])
    if (!info.isFile() || info.size > 1_048_576 || !target.startsWith(root + sep)) return
    const value = JSON.parse(await readFile(path, 'utf8'))
    if (value.id !== id || typeof value.task_name !== 'string' || typeof value.model !== 'string' ||
      !['in_progress', 'pass', 'partial', 'fail', 'abandoned'].includes(value.status) || !Number.isFinite(Date.parse(value.updated_at))) return
    return { id, task: value.task_name, status: value.status, model: value.model,
      updated: value.updated_at, testCount: Array.isArray(value.tests) ? value.tests.length : 0 }
  } catch {
    return undefined
  }
}
