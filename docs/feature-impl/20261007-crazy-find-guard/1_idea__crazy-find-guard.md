# Crazy-Find Guard — Idea & Problem Exploration

## Problem Statement

When AI coding agents need to locate files, they frequently fall back to executing runaway, unrestricted filesystem search commands in bash, such as:
- `find / -name "..."`
- `find ~ -name "..."` / `find ~/ -name "..."`
- `find $HOME -name "..."`
- `find /Users/<username> -name "..."`

In real developer workflows, these commands are virtually **never necessary**. They cause:
1. Massive delays and timeouts while traversing entire system trees, network mounts, virtual filesystems, and hundreds of thousands of files.
2. Cluttered context windows and frozen agent processes.
3. Severe disruption to user workflow, forcing the user to manually interrupt the agent.

In 100% of cases observed in practice, targeted searches (e.g. `find ./src ...`, `find ~/dev/project ...`, `rg --files`, `fd`) are what the agent actually needed.

Crucially: this is **not** disabling the `find` tool. Sensible, project-scoped `find` commands (`find .`, `find ./src`, `find ~/dev/...`) remain completely permitted. It is specifically a **crazy-find guard** that prevents indiscriminate sweeps of `/` and the user's home directory.

## Objective

Introduce a dedicated **crazy-find guard** in `pi-focus-guard`:
- **Default state**: Enabled by default (crazy find commands are forbidden out of the box).
- **Zero noise in bottom bar**: No status bar / footer icon required.
- **Whole-command blocking**: If a chained or compound bash command contains even one crazy find (e.g., `find ~/dev/concept -name "x.md"; find / -name "x.md"`), the entire bash call is blocked.
- **Friendly & actionable LLM denial message**: Explain clearly why it was denied, prompt the agent to use a more specific target path, and explicitly include the slash-command needed (`/focus-crazy-find-guard-off`) if the user genuinely wants to lift the guard.
- **Slash commands**: Enable/disable via dedicated `/focus-crazy-find-guard-off` and `/focus-crazy-find-guard-on` commands.
- **Startup flags / scripting support**: Selectable via `--crazy-find-guard-off` and `--crazy-find-guard-on`.
- **Persistence**: Persist user state across session reload/resume.

## Scope of "Crazy Find"

### Blocked Targets
A `find` command is blocked if any of its starting search paths resolve to:
1. Root directory: `/` (or redundant paths like `///`, `/./`).
2. User home directory:
   - `~` or `~/`
   - `$HOME` or `${HOME}` or `$HOME/`
   - The user's exact home directory path (e.g. `/Users/alice` or `/home/alice`, with or without trailing slash).

### Allowed Targets
- Project directories (e.g., `.`, `./src`, `/Users/alice/projects/my-app`).
- Home subdirectories (e.g., `~/dev`, `~/projects/concept`, `$HOME/.config`).
- Root subdirectories (e.g., `/tmp`, `/var/log`).
- Any non-find command (e.g., `fd`, `locate`, `rg`).
