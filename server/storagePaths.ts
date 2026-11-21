import { realpathSync } from 'node:fs'
import { basename, dirname, join, resolve, sep } from 'node:path'

export function canonical(path: string): string {
  try {
    return realpathSync(path)
  } catch (error) {
    const parent = dirname(path)
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || parent === path) throw error
    return join(canonical(parent), basename(path))
  }
}

export function privateStorage(env: NodeJS.ProcessEnv, servedDirectories: string[]) {
  const roots = servedDirectories.flatMap(directory => [resolve(directory), canonical(resolve(directory))])
  const paths = [
    ...(env.CHESSBOARD_DB === ':memory:' ? [] : [{ path: resolve(env.CHESSBOARD_DB ?? '.chessboard/live.sqlite'), directory: false }]),
    ...(env.CHESSBOARD_RUNLEDGER_DIR ? [{ path: resolve(env.CHESSBOARD_RUNLEDGER_DIR, 'runs'), directory: true }] : []),
  ]
  return paths.flatMap(({ path, directory }) => [...new Set([path, canonical(path)])].map(candidate => {
    if (roots.some(root => candidate === root || candidate.startsWith(root + sep))) {
      throw new Error('Keep the Chessboard journal and RunLedger receipts outside public/ and dist/.')
    }
    return { path: candidate, directory }
  }))
}
