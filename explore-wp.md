# Request (20260715_080614)

```
i want to be able to define write permitted directories on startup - is that possible now ?
```

# Response

Yes, **it is absolutely possible** to define write-permitted directories on startup! 

There are three different ways to achieve this depending on your workflow:

### 1. Using the Startup Flag (CLI)
You can specify the `--write-guard` flag when launching the agent, passing a comma-separated list of directories:

```bash
pi --write-guard "./docs,./src"
```

### 2. Using an Environment Variable
You can export the `PI_WRITE_GUARD_DIRS` environment variable before running the agent:

```bash
export PI_WRITE_GUARD_DIRS="./docs,./src"
pi
```

### 3. Using a Project Settings File (Persistent per project)
If you want these directories to be automatically permitted whenever you open this specific project, you can define them in your project's `.pi/settings.json` file. Any of the following keys are supported:

```json
{
  "piWriteGuard": {
    "allowedDirs": ["./docs", "./src"]
  }
}
```
*(Alternatively, you can use `"piWritePermit": { "allowedDirs": [...] }`, `"writePolicy": { "allowedDirs": [...] }`, or `"writeAllowDirs": [...]` as fallback keys).*

---

### Precedence & How they interact
The startup configuration follows a specific fallback precedence (from highest to lowest priority):

1. **Session Commands / Session State:** Any runtime commands you execute (like `/focus-write-guard-all` or `/focus-write-guard <dirs>`) or state restored from a previous active session will take top priority.
2. **CLI Flags:** `--write-guard <dirs>` overrides environment variables and project settings.
3. **Environment Variables:** `PI_WRITE_GUARD_DIRS` overrides project settings.
4. **Project Settings:** `.pi/settings.json` is used if none of the above are provided.

## Token Usage

🔢 **Model**: gemini-3.5-flash

📊 Token Usage
  ├─ Prompt:    25927
  ├─ Response:  415
  ├─ Thoughts:  1068
  └─ Total:     27410

## Generated Files

* Context: .codegiant/20260715_080614_codegiant_context.md
* Raw Output: .codegiant/20260715_080614_codegiant_llm_raw_output.json
* Response: .codegiant/20260715_080614_codegiant_llm_response.md
