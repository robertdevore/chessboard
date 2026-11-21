import type { BoardEventView, MessageView } from '@vercel/board'
import type { Actor, Event, Message, Task } from '../src/domain.ts'

export function normalizeActor(id: string, actor?: MessageView['author']): Actor {
  return { id, name: actor?.name ?? id, kind: actor?.kind ?? 'unknown', via: actor?.via?.name }
}

function webLink(value: string): string[] {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? [url.href] : []
  } catch {
    return []
  }
}

function fromView(boardId: string, key: string, type: string, timestamp: number,
  evidence: Event['evidence'], actor?: Actor, view?: MessageView): Event {
  const source = view?.task
  const task: Task | undefined = view && source ? {
    state: view.deleted ? 'canceled' : source.state, title: view.deleted ? 'Deleted task' : view.text.split('\n')[0],
    owner: source.by, assignee: source.for, holder: source.claim?.actor ?? null,
    leaseUntil: source.claim ? Date.parse(source.claim.until) : null, needs: source.needs,
    note: source.blocked?.reason ?? source.result ?? source.reason, step: view.labels.step,
  } : undefined
  const message: Message | undefined = view ? {
    id: view.id, authorId: view.by.actor, version: view.version, text: view.deleted ? '' : view.text,
    deleted: view.deleted, timestamp: Date.parse(view.createdAt), labels: view.deleted ? {} : view.labels,
    artifacts: view.deleted ? [] : view.attachments.map(({ id, name }) => ({ id, name })),
    links: view.deleted ? [] : view.links.flatMap(link => webLink(link.url)),
  } : undefined
  const block = view?.blocks.find(item => item.schema === 'chessboard-verification' && item.version === 1)
  const mentions = [...(message?.text.matchAll(/@\[([^\]\r\n]+)\]/g) ?? [])].map(match => match[1])
  return {
    id: JSON.stringify([boardId, evidence, key]), source: 'board', sourceEventId: key, boardId,
    channelId: view?.channel, threadId: view ? view.re ?? view.id : undefined, taskId: task ? view?.id : undefined,
    actor, type, timestamp, order: 0, evidence, task, message,
    relatedAgents: [...new Set([task?.holder, task?.assignee, ...mentions].filter((id): id is string => Boolean(id)))],
    metadata: { mission: message?.labels.mission, mentions,
      verification: typeof block?.data.result === 'string' && !view?.deleted ? block.data.result : undefined },
  }
}

export function normalize(boardId: string, raw: BoardEventView): Event | null {
  const view = raw.message
  if (!view && raw.type !== 'actor.seen') return null
  const author = 'by' in raw.payload && typeof raw.payload.by === 'object' ? raw.payload.by : undefined
  const identity = raw.actor ? normalizeActor(raw.actor.id, raw.actor)
    : raw.type === 'actor.seen' ? { id: raw.payload.actor, name: raw.payload.name, kind: raw.payload.kind }
      : author ? normalizeActor(author.actor, view?.by.actor === author.actor ? view.author : undefined)
        : raw.type === 'message.posted' && view ? normalizeActor(view.by.actor, view.author) : undefined
  return fromView(boardId, raw.cursor, raw.type, Date.parse(raw.createdAt), 'observed', identity, view)
}

export function snapshot(boardId: string, view: MessageView, now: number): Event {
  return fromView(boardId, 'message:' + view.id + ':' + view.version, 'snapshot.message', now, 'snapshot',
    normalizeActor(view.by.actor, view.author), view)
}

export function actorSnapshot(boardId: string, actor: Actor, now: number): Event {
  return fromView(boardId, 'actor:' + actor.id, 'snapshot.actor', now, 'snapshot', actor)
}
