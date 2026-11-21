# Implementation and verification

Verified on 2026-11-21 with Node 26.12.1, @vercel/board 0.54.0, and Playwright running local Chrome.

| Check | Result |
| --- | --- |
| `npm run build` | Strict TypeScript and optimized Vite build passed. |
| `npm test` | 11 passed. Covers SDK ingestion, stable identity, Board task transitions, version ordering, duplicates, leases, deterministic playback, one-piece placement, collisions, overflow, reconciliation, mode isolation, API permissions, and RunLedger receipt validation. |
| Capacity and bursts | Checked 1, 8, 16, 32, 64 and 96 simultaneous actor identities. A burst of 1,000 actor updates mixed with 400 task transitions passed the reducer smoke budget. |
| Browser suite | Four passed with hosted Board enabled for the connected test. Includes desktop keyboard selection, inspector values, timed transforms, seek and mode isolation, mobile containment and reduced motion, and screenshot generation. |
| Official local Board | `vb serve` and `vb whoami` succeeded. CLI lifecycle created a task, claimed and renewed it, posted a reply, failed it, reopened and reclaimed it, then completed it. All stages appeared in the local journal. Live and Replay passed a separate Chrome run against this server. The SDK integration test closes the collector, writes while disconnected and verifies cursor recovery after restart. |
| Hosted Board | Authenticated to an existing Board with explicit scope. Ingested actual hosted actor and message snapshots and verified Live and Replay in Chrome. Hosted verification was read-only. |
| Visual inspection | Reviewed the desktop and mobile PNGs. Pieces stay within their board cells, selected states have contrast and redundant text, and mobile controls stay within the viewport. |

[Desktop screenshot](screenshots/desktop.png) · [Mobile screenshot](screenshots/mobile.png)

## Boundaries

Replay history starts at the first local observation. The initial snapshot establishes current state, with older transitions unavailable from this journal. A Board cursor reset creates a visibly marked reconciliation boundary. The UI never infers a running agent from recent chat alone or treats a lease expiry as a definitive disconnect.

Hosted task mutations were exercised on the official loopback backend, while the hosted Board received only read requests. Chessboard itself is read-only. It uses explicit Board labels for mission grouping and review, and follows only the configured Board per process. Source links depend on actual synced destinations or message links. RunLedger is an opt-in evidence reader for correlated receipts.

The tests measure reducer throughput and verify transform and reduced-motion behavior in Chrome. They do not establish a frame-rate target across device classes.

## Dependency advisory

Dependabot reported the nested Zod 4.1.11 copy under Board → OIDC → CLI config. The package override updates only that nested dependency to the already-used Zod 4.6.7. The resolved tree contains one Zod version, the audit returned zero vulnerabilities, and the pinned CLI still authenticated against the hosted and official local Boards. [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5)
