# Chessboard hardening

| | |
| --- | --- |
| Repository | `robertdevore/chessboard`, `main` |
| Starting commit | `e359af9f578b0fc034507afa21e6bd37368be492` |
| Verified code commit | `58ed373d0873a93aff9d5326be4032b742d3000b` |
| Scope | Fix mode, 2026-11-21 |
| Purpose | Show Vercel Board activity in a local browser and record it for replay. |
| Main dependencies | Node, Vite, React, SQLite, Vercel Board SDK. Optional RunLedger receipts. |

## Baseline

The checkout was clean. On Node 26.12.1 and macOS, the build and all 11 Node tests passed. Desktop and mobile Playwright tests passed. The test run used Chrome and left its live Board and screenshot cases off. `npm audit --audit-level=high` reported zero vulnerabilities.

## Findings and fixes

| ID | Priority | Area | Finding and evidence | Action and verification |
| --- | --- | --- | --- | --- |
| CB-01 | P0 | Persistence | Two collectors could read the same checkpoint. The slower collector could append stale observations and overwrite the cursor after the faster one committed. | `server/journal.ts` compares the expected cursor inside the write transaction. A test with two SQLite connections verifies that the stale write leaves both the cursor and observations intact. The collector retries from the saved cursor. |
| CB-02 | P0 | Local data | The dev server denied common database extensions. It could still serve a configured journal with a custom filename or raw RunLedger receipts in the checkout. The built server also needed to keep configured private storage out of its static root. | Vite denies the configured journal, sidecars, and receipt directory. Both servers reject private storage under `public/` or `dist/`, including aliases resolved at startup. Tests cover custom names, sidecars, receipts, and a linked static directory. |
| CB-03 | P0 | Local access | The API checked the Host header but did not check the socket peer. It copied the configured Board URL into browser-readable event identifiers and accepted extra query parameters. | The API checks loopback peers and browser fetch origin. Board URLs may use the documented `teamId` parameter. The API rejects credential-bearing URLs and directs operators to `BOARD_TOKEN`. Tests cover cross-origin requests, rejected writes, and credential settings. |
| CB-04 | P1 | Recovery | The browser kept a numeric offset even when the server replaced its journal under the same scope. A lower or reused event sequence could stall the feed or append mismatched history. | The browser sends the last event ID. The API compares it with the journal and returns the first page with a reset flag if the cursor is obsolete. The browser drops the old history and resets playback. API and browser tests exercise this case. |
| CB-05 | P1 | Runtime | The Live view copied all projected message and task maps on each one-second clock tick. Identical API responses also triggered renders. | The browser reuses unchanged feed state and schedules work at the next lease expiry. The reducer keeps the previous projection until an expiry can change the result. Unit and browser tests cover the expiry boundary. |
| CB-06 | P1 | Files and shutdown | RunLedger checked the size and type before reopening a path for an unbounded read. The built server opened a stream after a separate file check without handling stream errors. Shutdown could close the journal twice. | RunLedger checks and reads the same descriptor, rejects linked files and caps file reads. The built server opens and checks the file before responding and handles missing files or stream errors. API shutdown is idempotent. Tests cover bounded and linked receipts, and the built-server smoke check covers GET, HEAD, and failure responses. |
| CB-07 | P2 | Public documentation | The README offered a release download but no inline player. The official Board link appeared below the setup instructions. | The README now opens with a Board link and uses a GitHub video attachment for inline playback. The release download remains available. Signed-out Chrome played the 92-second video on the repository page. |

Files affected include `server/{api,collector,journal,runledger,start,storagePaths}.ts`, `vite.config.ts`, `src/{app,domain,useFeed}.ts[x]`, the README, and the Board setup and architecture notes. Regression coverage lives in `tests/board.test.ts`, `tests/domain.test.ts`, `tests/interface.spec.ts`, and `tests/vite.test.ts`.

## Performance and coverage

The idle projection benchmark held 50,000 messages in a populated demo projection and ran 120 refresh calls after one warm-up. Each sample checked that the task and message counts matched. Five before samples took 1,047–1,063 ms, with a median of 1,056.74 ms. Five after samples took 0.10–0.15 ms, with a median of 0.11 ms. This measures the path without a pending lease expiry. It measures neither browser paint nor initial history load. The Vite JavaScript bundle moved from 80.61 kB to 81.24 kB gzip. No dependency changed. Peak memory and token use were not measured.

To repeat the projection sample, run this from the checkout on each commit.

```sh
node --import tsx --input-type=module <<'JS'
import { performance } from 'node:perf_hooks'
import * as domain from './src/domain.ts'
import { demoEvents } from './src/demo.ts'
const state = domain.advance(domain.emptyState(), demoEvents.slice(0, 32))
state.messages = new Map(Array.from({ length: 50_000 }, (_, i) => ['message-' + i, demoEvents[9]]))
function sample() {
  const then = performance.now()
  for (let i = 0; i < 120; i++) {
    const next = domain.refreshAt ? domain.refreshAt(state, Date.now()) : domain.advance(state, [], Date.now())
    if (next.messages.size !== state.messages.size || next.tasks.size !== state.tasks.size) throw Error('History changed')
  }
  return performance.now() - then
}
sample()
console.log(Array.from({ length: 5 }, sample))
JS
```

| Audit phases | Coverage |
| --- | --- |
| 0–1 | Read the server, browser, package scripts, Vite config, tests, setup, and release material. Ran the baseline build, tests, browser checks and dependency audit. |
| 2–4 | Examined projection, polling, SQLite writes, file handles, timers, and feed retention. Removed idle projection work and empty unchanged checkpoint writes. |
| 5–6 | Charts and inspectors read recorded events in pages. Chessboard does not send events to a language model or register agent tools. No model context or schema budget applies. The dashboard keeps evidence available on demand. |
| 7–9 | Checked cursor errors, concurrent poll writes, restore and restart recovery, authorization, file boundaries, and cleanup. |
| 10–12 | Checked route behavior, environment settings, SDK compatibility, and dependency state. Added targeted regressions while keeping the existing integration and replay checks. |
| 13 | Added deterministic behavioral checks to the existing test commands. The repository has no CI workflow. No performance timing gate was added. |
| 14–16 | Updated the setup and architecture notes and verified the README player. Kept release footage, stored history, and optional integrations. No runtime dependency met the removal criteria. |
| 17–18 | Implemented the verified fixes and repeated the build, unit, browser, local Board and dependency checks. |

## Compatibility and remaining work

The SQLite schema, event format, environment variable names, and normal route behavior stay compatible. `/api/events` accepts the optional `seen` ID and can send a `reset` flag. Valid Vercel and official loopback Board URLs still work. Move private storage outside the static folders and pass credentials separately if an existing setup used either of those locations. The Vercel Board and RunLedger repositories need no changes.

**Needs more evidence.** Replay still loads the recorded journal into browser memory. Measure startup and retention with a long-lived deployment before choosing a paging design that preserves complete replay. The hosted Board was not retested in this pass. The connected browser flow used the official local backend.

## Verification

| Command or check | Result |
| --- | --- |
| `npm run build` | Passed before and after. |
| `npm test` | 11 passed before. 17 passed after. |
| `npm audit --audit-level=high` and `npm ls --depth=0` | Audit found zero vulnerabilities. The installed direct dependency list resolved. |
| `CHESSBOARD_TEST_BROWSER='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser` | Baseline desktop and mobile passed. |
| `CHESSBOARD_LIVE_TEST_URL=http://127.0.0.1:5195 CHESSBOARD_TEST_BROWSER='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' npm run test:browser` | Four passed, including the local Board and the expired-lease and restored-journal case. Screenshot regeneration was off. |
| `vb serve --port 45943 --dir <temporary directory> --no-inspect --no-open` and `node --import tsx server/start.ts` | A task was created, claimed, and completed against the local server. Built server returned 200 for HEAD on the home page, 404 for missing files, and 405 for POST. |
| Public GitHub README in signed-out Chrome | The video controls were present and playback advanced. The Vercel Board link pointed to the official docs. |
| `git diff --check` | Passed. |

[Vercel Board docs](https://vercel.com/docs/board) · [GitHub video attachments](https://docs.github.com/en/github-cli/github-cli/attaching-files-with-github-cli)
