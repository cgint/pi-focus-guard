# Crazy-Find Guard — Requirements & UX Specification

## Functional Requirements

### 1. Default Behavior
- The guard is **enabled by default** on fresh sessions without requiring any CLI flags or configuration.
- When enabled, any bash tool execution containing a `find` invocation targeted at the root directory (`/`) or the user's home directory (`~`, `$HOME`, `/Users/<user>`, etc.) must be blocked before execution.

### 2. Detection in Chained, Piped & Nested Commands
- Bash scripts can chain multiple commands via `;`, `&&`, `||`, `|`, or newline.
- Bash commands can contain subshells `(...)`, command expansions `$(...)` or `` `...` ``, command wrappers (`sudo`, `env`, `nohup`, `command`), or conditional blocks (`if ...; then ...; fi`).
- **Atomic blocking rule**: If **any** statement or nested sub-command within the bash call violates the rule, the **entire bash tool call is denied**.
- Example:
  ```bash
  find ~/dev/concept -name "x.md"; find / -name "x.md"
  ```
  Must be blocked immediately without running either command.

### 3. Argument Parsing & Path Extraction for `find`
POSIX, BSD, and GNU `find` allow flags before search paths, followed by paths, followed by expressions/predicates:
1. **Pre-path options**:
   - POSIX: `-H`, `-L`, `-P`
   - BSD / macOS: `-E`, `-X`, `-f`, `-s`, `-x`
   - GNU: `-O*`, `-D *`
   - Arguments matching pre-path options do not terminate path collection and are skipped as paths.
2. **Path collection**:
   - Starting search directories are collected immediately following pre-path options.
   - Path collection **terminates** at the first argument that begins a predicate or operator:
     - An argument starting with `-` that is not a pre-path flag (e.g., `-name`, `-type`, `-exec`, `-mtime`).
     - Operators: `(`, `)`, `!`, `,`.
3. **Empty path default**:
   - If no path arguments precede predicates (e.g. `find -name "x.md"`), `find` defaults to `.` in GNU find or errors on BSD.
   - If resolved against `cwd`, this defaults to `cwd`. If `cwd` itself is `/` or user home, it is treated as a broad search (see section 4).

### 4. Target Path Classification Rules
Each extracted path argument is evaluated against the filesystem boundary:

#### A. Root Directory Check
A path argument violates the root guard if:
- Raw path is `/`, `//`, `///`, or `/./`.
- Quoted literal is `"/"`, `'/'`.
- Resolving relative to execution context (`cwd`) resolves strictly to `/`.

#### B. User Home Directory Check
A path argument violates the home guard if:
- Raw path is `~`, `~/`, `~<username>`, `~<username>/` (where `<username>` is the active OS user).
- Quoted or bare environment expansion is `$HOME`, `${HOME}`, `"$HOME"`, `"${HOME}"`.
- Resolving and canonicalizing relative to `cwd` (handling symlinks like `/private/var` vs `/var` and stripping trailing slashes) strictly matches `os.homedir()` or `realpath(os.homedir())`.

#### C. Allowed Searches
- Project directories: `.`, `./src`, `/Users/<user>/dev/repo`, `~/projects/my-app`.
- Root subdirectories: `/tmp`, `/var/log`, `/etc`.
- Home subdirectories: `~/dev`, `$HOME/workspace`, `/Users/<user>/.config`.

### 5. Denial Message Format
When blocked, the tool call must reject with `block: true` and a structured message:
```text
[BASH DENIED — CRAZY FIND GUARD]

Blocked action
Bash command contains an unrestricted root or home directory search:
  <offending find expression or command>

Why guarded
Searching the entire root directory ('/') or user home directory leads to excessive latency, massive output, and frozen agent turns. In virtually all cases, locating project files only requires searching specific directories (e.g. './src', '~/dev/...').

Next step
1. Narrow the search path to the specific project or directory of interest.
2. If this unrestricted search is truly required and requested by the user, ask the user to run:
     /focus-crazy-find-guard-off
   in their chat prompt to lift this restriction.
```

### 6. Slash Commands & Startup Flags

#### Slash Commands
To allow users to toggle the guard in-session:
- Disable command (lifts the restriction):
  - `/focus-crazy-find-guard-off`
- Enable command (restores restriction):
  - `/focus-crazy-find-guard-on`
- Status command:
  - `/focus-crazy-find-guard` (shows whether crazy-find guard is currently ON or OFF)

#### Startup Flags (CLI / Scripting Support)
- `--crazy-find-guard-off`: Starts the session with the crazy-find guard disabled.
- `--crazy-find-guard-on` (alias `--crazy-find-guard`): Starts the session with the guard explicitly enabled.

#### Precedence Matrix
| Startup Flags | Persisted Session Entry | Resulting State |
| :--- | :--- | :--- |
| `--crazy-find-guard-off` | Any (or None) | **OFF** |
| `--crazy-find-guard-on` / `--crazy-find-guard` | Any (or None) | **ON** |
| None | `{ enabled: false }` | **OFF** |
| None | `{ enabled: true }` | **ON** |
| None | None (fresh session) | **ON** (Default) |

### 7. Persistence & UI
- Custom session entry type: `focus-crazy-find-guard` storing `{ enabled: boolean }`.
- Persists changes triggered by slash commands or startup flag overrides.
- Restores on session resume (`session_start`).
- **No status bar icon**: Footer status bar must remain untouched (no extra icon).
- Notifications (`ctx.ui.notify`): Inform user when toggled via slash commands.
- Fail-closed parser behavior: If `unbash` throws a syntax parse error on a command containing `find`, fail-closed with clear error explanation.
