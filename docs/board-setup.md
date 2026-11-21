# Board setup

Start with the [README](../README.md). Chessboard uses the `vb` CLI bundled with its pinned Board SDK. Run it from the checkout after `npm ci`.

## Choose a connection

Set one of these in `.env` and restart Chessboard.

| Setting | Use it when |
| --- | --- |
| `CHESSBOARD_TEAM` and an optional `CHESSBOARD_BOARD_NAME` | You want to read a hosted Board by team slug and board name. The default name is General. |
| `CHESSBOARD_LIVE=1` | Your Vercel project is already linked. |
| `BOARD_URL` | You have the Board URL from `npx vb whoami` or use the official local server. Set `BOARD_TOKEN` in the local environment if the server requires an explicit credential. |

Set `CHESSBOARD_CHANNEL` to limit collection to one channel. Set `CHESSBOARD_DB` to choose where Chessboard stores observations. The default is `.chessboard/live.sqlite`.

## Try a local Board

Start the official Board server in its own terminal.

```sh
npx vb serve --no-inspect --no-open
```

Set `BOARD_URL=http://127.0.0.1:4100/api/board` in `.env`. Restart Chessboard and open **Live**. The SDK uses the local credential created by `vb serve`.

Run these commands one at a time in a third terminal to watch a task move through the board.

```sh
export BOARD_URL=http://127.0.0.1:4100/api/board
npx vb whoami
task_id=$(npx vb tasks create work 'Verify keyboard navigation' --label step=review --label mission=Release)
npx vb tasks claim "$task_id" --as reviewer
npx vb tasks renew "$task_id" --as reviewer --lease 10m
npx vb reply "$task_id" 'Keyboard verification passed.' --as reviewer
npx vb tasks complete "$task_id" 'Acceptance passed.' --as reviewer
```

Use `npx vb actors --json` to find actor IDs. Set `CHESSBOARD_ROLES` to a JSON object that maps those IDs to Commander, Orchestrator, Builder, Reviewer, Specialist, or Worker. Chessboard shows other actors as Unmapped.

## Label work

- Use `mission=<name>` on thread roots to group them in the mission filter. Replies follow the root.
- Use `step=review` on review tasks. The agent moves into verification when it claims the task.
- Register `chessboard-verification@1` in Board if your workflow sends structured verification results. The inspector reads the string `result` from that block.
- To show a RunLedger receipt, set `CHESSBOARD_RUNLEDGER_DIR` and add `runledger=<run-id>` to the thread root. The inspector reads `runs/<run-id>.json` and shows a summary under **Source links**.

## Use the interface

Pause **Live** to hold the current board and inspector view while recording continues. **Replay** starts from the first local observation. Use Tab to reach pieces and the arrow keys to move focus. **Depth** switches between the two render styles. The activity list works with reduced motion.

Run `npm run build && npm start` to serve the built app locally. Set `CHESSBOARD_TEST_BROWSER` to a compatible Chromium executable for browser tests, or use Playwright's browser. Set `CHESSBOARD_CAPTURE=1` to refresh the demo screenshots.

[Vercel Board setup and CLI reference](https://vercel.com/docs/board)
