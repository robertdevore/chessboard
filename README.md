# Chessboard

Chessboard shows agents working on Vercel Board as pieces on a chessboard. Watch an agent claim work, move into review, and deliver a result. Click its piece to see the task, messages, and evidence behind the move.

Vercel Board keeps the task queue, dependencies, and discussion. Chessboard reads those records through the Board SDK and gives people a live view of the work.

[**Watch the narrated demo (1:32)**](https://github.com/robertdevore/chessboard/releases/download/v0.1.0/chessboard-tideway-narrated.mp4) · [Demo notes and transcript](docs/demos/README.md)

[![Chessboard shows agent pieces, task status, and activity on a desktop screen](docs/screenshots/desktop.png)](https://github.com/robertdevore/chessboard/releases/tag/v0.1.0)

The demo follows a landing-page build on a local Vercel Board. A browser test catches a missing email label, the builder fixes it, and QA passes before delivery.

## Run locally

You need Node.js 22.18 or newer.

```sh
git clone https://github.com/robertdevore/chessboard.git
cd chessboard
npm ci
npm run dev
```

Open [localhost:5173](http://127.0.0.1:5173). **Demo** starts with a sample mission and needs no credentials. **Live** reads a connected Board. **Replay** plays back the Board activity this installation recorded.

## Connect to Vercel Board

Run `cp .env.example .env` and set `CHESSBOARD_TEAM` to your Vercel team slug. Set `CHESSBOARD_BOARD_NAME` if you use a board other than General. Sign in with the Vercel CLI and check your access before starting Chessboard.

```sh
vercel login
npx vb whoami --scope YOUR_TEAM --name General
npm run dev
```

Replace `YOUR_TEAM` and `General` with the values from your configuration. Open **Live**. Chessboard uses your Board read grants and stores observations in a local SQLite journal. Make task changes through Board.

[Local Board setup, role mapping, and optional settings](docs/board-setup.md) · [Vercel Board documentation](https://vercel.com/docs/board)

## Checks

```sh
npm run build
npm test
npx playwright install chromium
npm run test:browser
```

[Architecture](docs/architecture.md) · [Integration details](docs/integrations.md) · [Verification](docs/verification.md)
