# Integration compatibility

## Vercel Board discovery

The November 18 launch announcement describes Board as experimental. The requested `/docs/agent-resources/vercel-board` URL returned 404. Current documentation is under `/docs/board`. The pinned package ships more detailed SDK, CLI, local-backend, and UI integration documentation. Upstream source inspected at `c2d3324`. [Announcement](https://vercel.com/blog/introducing-vercel-board) · [Changelog](https://vercel.com/changelog/vercel-board-is-now-available) · [Board docs](https://vercel.com/docs/board) · [SDK](https://vercel.com/docs/board/sdk) · [CLI](https://vercel.com/docs/board/cli-reference) · [Source](https://github.com/vercel/board/tree/c2d3324) · [Agent Swarm](https://vercel.com/docs/board/guides/agent-swarm)

| Capability | Verified interface and rules | Chessboard |
| --- | --- | --- |
| Authentication | Board uses Vercel CLI login, a supported scoped token, or deployment OIDC. `vb whoami` resolves a Board and principal. Profiles inherit the principal's grants. | SDK reads as the configured principal. Browser receives normalized records and never receives credentials or lease proof. |
| Local development | SDK `local()` provides the official in-process SQLite or memory backend. `vb serve` runs the official loopback server. Hosted wake-by-path, Vercel account credentials, and Vercel Connect are services. | Live works with either hosted Board or the official local server. Demo runs independently. |
| Channels, threads and tasks | `channels()`, `channel().messages()`, `thread()`, and `tasks.list()`. A task is the root of a thread. | Bootstraps readable channels, recent messages and paginated task roots. Filters use channel IDs and thread references. |
| Agent identity | `actors()`, `actor.seen`, `message.by.actor`, event actor ID and task assignment/holder IDs. | Stable identities are Board actor IDs. Exact-ID role mapping is optional. Human/external authors appear in activity and can be mapped manually when appropriate. |
| Task lifecycle | Native ready, waiting, claimed, blocked, completed, failed, canceled. Claim epochs and expiring leases govern renew, release and settlement. `task.assigned` changes claim eligibility. | Holder drives execution. Blocked/failed/expired positions retain their last square. An expired lease becomes Unknown while awaiting a newer Board observation. |
| Structured messages | Messages may carry schema-validated blocks, labels, replies, mentions, attachments and linked records. | Uses mission/review labels, normalized reply roots, canonical actor mentions, artifact references and optional verification blocks. |
| Events and history | `events()` streams or follows the backend's long-poll. `poll()` returns an ordered page plus cursor. `last` returns up to 100 events with potentially current message views. | Uses official bounded long-poll for transactional page/checkpoint commits, then paged local browser fetches. Bootstraps snapshots without projecting recent-history views into invented transitions. |
| Wake-up | Watchers match events. The hosted service can wake a registered deployment; local watchers run while their process is running. `wait` supports an agent already waiting on a thread, channel or mention. | Observes activity passively. No watcher or wake registration is required. |
| Grants and mutations | Board permits posting, assignment, cancellation and other actions under different grants, often restricted to the owner/holder and lease proof. | API accepts GET only. Operations that alter Board are performed through the Board CLI under its own permission model. |
| Source links | `sync(id)` returns platform URLs if supplied. The SDK returns Board thread IDs without guaranteeing a browser permalink for an unsynced thread. | Opens available message/sync URLs. Otherwise displays the thread reference for `vb read ID`. |

The installed Vercel CLI 59.1.4 treated `vercel board whoami` as a deployment command and rejected the extra paths. Vercel CLI 66.6.0 recognized the command, but default scope discovery failed in this environment. The pinned Board CLI 0.54.0 successfully resolved an explicit cloud scope and authenticated to the loopback Board. The upstream Board skill was reviewed alongside the release docs. Installation is optional for agents conducting work on Board (`npx skills add vercel/board --skill board`). Chessboard and its collector require only the SDK.

## Kujo compatibility

Local repositories, CLI documentation, selected machine-readable stores and installed Hermes profile names were inspected. Board actor IDs remain authoritative. None of the local interfaces implies a native Board bridge.

| Component | Interface and event/identity model | Install/auth requirements | Initial practicality |
| --- | --- | --- | --- |
| Kujo runtime | `kujo` CLI and modules; runtime and tool execution identities | Kujo binary; provider or service credentials apply only to called services | Standalone runtime has no Board actor/event mapping |
| Kujo Agents / Chain of Command | Versioned role contracts and installed Hermes role profiles, with canonical role keys | Contracts are files; Hermes/Discord needs its own profile setup and credentials | Map explicit Board actor IDs onto chess roles. Registry names alone do not identify a Board actor |
| Dispatch | `runs --json`, trace and report files, with run, step, attempt and role fields | Kujo and Dispatch; local receipts; provider credentials depend on workflow | Usable for a future read adapter if a workflow also emits Board correlation IDs |
| Workcell | Versioned job definitions and receipt, verification and artifact JSON; job and receipt IDs | Kujo and Docker/Podman for execution; existing receipt reads need filesystem access | Additional Task evidence when an explicit receipt correlation is available |
| RunLedger | Per-run JSON receipts including model/provider, status and manually recorded test evidence | Existing local `.runledger/runs/` directory; no credentials needed to read it | Implemented optional, bounded receipt evidence via a Board task root label. No inferred identity or task transitions |
| Casefile | `show --format json` and case bundle contract; case IDs and execution evidence | Kujo Casefile CLI or filesystem access; bundles may be sensitive | Explicit artifact link is practical. No general importer enabled |
| Shipcheck | `scan` / `gate --format json`; release gate conclusions | Kujo and Shipcheck. Checks inherit repository environment | Good for explicitly posted verification blocks; no automatic adapter |
| Watchdog | JSON APIs and OTLP/local batches; trace/run correlation and producer identity | Local Watchdog; optional API/key or upstream credentials by deployment | Requires explicit Board-to-telemetry correlation before exposing traces |
| Kujo MCP | Tool/resource protocol and generated server manifests | Kujo runtime and configured transport/auth policy | Useful to publish a separate bridge later. No shared Board identity by default |
| Software Factory | Typed mission/workflow manifests, evidence receipts, and read-only MCP discovery | Factory runtime plus chosen harness/provider setup; local evidence can be read separately | Mission conventions are compatible with labels when workflows publish them. No Factory controller changes |
