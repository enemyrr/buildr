# Turn checkpoints

The daemon snapshots an agent's Git worktree at every foreground turn boundary, for every provider. The snapshots back two features: the diff of a single turn and restoring files to the state before a turn. Provider-native rewind (`packages/server/src/server/agent/rewind/`) is separate and unchanged; it still owns conversation rewind and provider file rewind where the provider supports it.

Code: `packages/server/src/server/agent/checkpoints/` (Git store and per-agent coordinator) and `packages/server/src/server/session/checkpoints/` (RPCs).

## Storage

Each turn gets two commits under hidden refs in the agent's repository:

```
refs/buildr/checkpoints/<agentId>/<turnIndex>/start
refs/buildr/checkpoints/<agentId>/<turnIndex>/end
refs/buildr/checkpoints/<agentId>/backup
```

The refs are the only record. The commit subject carries the Paseo user-message ID that started the turn, so a daemon restart rebuilds the turn list and the next turn index from `git for-each-ref`. Nothing is persisted under `$PASEO_HOME`.

Capture stages the whole worktree into a throwaway index (`GIT_INDEX_FILE` in a temp directory), then runs `write-tree`, `commit-tree`, and `update-ref`. HEAD, the user's index, and the working tree are never written, so staged work survives. Untracked files are included and `.gitignore` is respected, because the capture is `git add -A` against the private index.

The private index starts as a copy of the user's index so `git add` rehashes only changed files. The copy must keep the original file's timestamp. Git rehashes an entry when the file changed in the same instant the index was written; a copy stamped "now" hides that, and a same-size edit made in that instant gets captured as unchanged. `store.test.ts` pins this case.

## Turn boundaries

`AgentManager.streamAgent` captures `start` before it calls the provider's `startTurn`, and `finalizeForegroundTurn` captures `end`. Internal agents and autonomous (provider-initiated) turns get no checkpoints. Steered prompts join the active turn.

Checkpoints never block or fail a turn:

- The start capture waits at most 2 seconds, then the turn proceeds while the capture finishes in the background.
- The end capture is fire-and-forget.
- A failed capture is logged as `turn_checkpoints.operation_failed` and skipped. A directory that isn't a Git worktree skips capture silently.

All Git work for one agent runs through one queue, so an end capture can't overtake its start.

## Restore

`agent.checkpoint.restore_files.request` makes the working tree match the turn's `start` checkpoint. It first captures the current state to the `backup` ref, so you can recover a mistaken restore with `git restore --source=refs/buildr/checkpoints/<agentId>/backup --worktree -- .`. It then deletes files that didn't exist at the checkpoint and writes changed files back through a private index. HEAD and the user's index stay untouched; `git status` afterward shows the restored state against HEAD.

Restore rewrites the whole worktree, so the daemon refuses it unless all of these hold:

- The agent's workspace has kind `worktree`.
- No other live agent shares that workspace or directory.
- The agent has no run in flight.

The list response reports the refusal reason as `restoreFilesBlockedReason` so the app can disable the action and explain why. The restore RPC still checks on its own.

## Lifecycle

Archiving or deleting an agent deletes all of its checkpoint refs. The refs keep their objects reachable, so Git's garbage collection never prunes a live checkpoint.

## Protocol

The RPCs are `agent.checkpoint.list`, `agent.checkpoint.get_turn_diff`, and `agent.checkpoint.restore_files`, gated on `server_info.features.agentCheckpoints`. The app opens a turn's diff as a `turn_diff` tab keyed by agent and user-message ID, and resolves the turn index from the list response.

## Limitations

- Sparse checkouts and files marked `assume-unchanged` or `skip-worktree` capture their index state, not their worktree content.
- Nested repositories without a commit make `git add -A` fail, and the turn gets no checkpoint.
- Large untracked files that `.gitignore` doesn't exclude are hashed into the object store on every capture.
- Turn diffs don't detect renames; a rename shows as a delete and an add.
