# Gravity — Task Todo List

Format: each task gets a line with a checkbox `[ ]` (pending) or `[x]` (done).
Update this file before starting any new task and after completing it.

## In Progress

- [ ] Verify provider install and CLI sign-in flows end-to-end (neither `codex` nor `claude` is on this machine)
- [ ] Verify chat against installed Claude Code and Codex CLIs (neither is on this machine)

## Completed

- [x] Redesign New profile dialog: provider cards with CLI install + CLI sign-in (Codex, Claude Code)
- [x] Pin Settings to the bottom of the sidebar, separate from the primary destinations

- [x] Replace Launch.tsx with Chat.tsx, update PageId/sidebar, add chat components and streaming hook
- [x] Move terminal launch to Projects and remove tauri-plugin-shell
- [x] Add stream fixtures and parser/handoff/DB tests; run all checks; commit, push
- [x] Add manual account switch for chats and keep the terminal-session switch reachable from Activity
- [x] Add capability probes for claude --help / codex exec --help
- [x] Add chat commands and register them in commands.rs and lib.rs
- [x] Fix src-tauri/src/chat/mod.rs to declare submodules and export chat types
- [x] Chat interface feature (feat/chat-interface) merged into master
- [x] Add todo.md task tracking rules

## Backlog

- [ ] Add a chat-to-chat diff view so a switched turn shows what the new account changed
- [ ] Reconcile stale chat sessions on startup the same way terminal sessions are reconciled
