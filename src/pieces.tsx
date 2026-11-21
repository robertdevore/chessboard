import type { Role } from './domain.ts'

export const pieceNames: Record<Role, string> = {
  Commander: 'King', Orchestrator: 'Queen', Builder: 'Rook', Reviewer: 'Bishop',
  Specialist: 'Knight', Worker: 'Pawn', Unmapped: 'Unmapped',
}

export function ChessPiece({ role }: { role: Role }) {
  return <svg className="piece-icon" viewBox="0 0 48 48" aria-hidden="true">
    <g stroke="currentColor" strokeWidth="1.65" strokeLinejoin="round" strokeLinecap="round">
      {role === 'Commander' && <>
        <path d="M24 4v10m-4-6h8" fill="none"/>
        <path d="M24 12c5 4 5 8 3 12 5-8 14-7 13 0-1 5-5 7-7 11H15c-2-4-6-6-7-11-1-7 8-8 13 0-2-4-2-8 3-12z"/>
      </>}
      {role === 'Orchestrator' && <>
        <path d="M9 15l9 10 1-14 5 12 5-12 1 14 9-10-6 20H15z"/>
        <circle cx="8" cy="13" r="2.5"/><circle cx="18" cy="9" r="2.5"/><circle cx="30" cy="9" r="2.5"/><circle cx="40" cy="13" r="2.5"/>
      </>}
      {role === 'Builder' && <path d="M11 10h6v6h4v-6h6v6h4v-6h6v11l-5 5 2 9H14l2-9-5-5z M15 22h18" />}
      {role === 'Reviewer' && <>
        <circle cx="24" cy="7.5" r="2.5"/>
        <path d="M24 10c-3 5-11 9-11 15 0 4 3 6 6 7l-3 3h16l-3-3c3-1 6-3 6-7 0-6-8-10-11-15z"/>
        <path d="m20 24 8-9" fill="none"/>
      </>}
      {role === 'Specialist' && <>
        <path d="M15 35c1-7 10-10 12-16l-8 4-4 4-6-3 2-8 6-4 4-5 3 4c11 0 15 8 14 24z"/>
        <path d="M15 18h.5" fill="none" strokeWidth="2.5"/>
      </>}
      {role === 'Worker' && <path d="M24 9a7 7 0 0 1 4 13c0 6 2 10 5 13H15c3-3 5-7 5-13a7 7 0 0 1 4-13z"/>}
      {role === 'Unmapped' && <path d="m24 10 11 12-11 12-11-12z"/>}
      <path d="M14 35h20l3 5v3H11v-3z M12 40h24"/>
    </g>
  </svg>
}
