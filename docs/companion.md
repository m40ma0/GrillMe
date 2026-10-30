# Companion (DemoGuard)

The companion runs on the presenter machine during a DemoGuard run. It is optional: without it, DemoGuard still watches the shared screen ("browser mode").

What it adds:

- **Network signals.** A local proxy in front of your demo app reports every response. A 5xx on the demo path is a critical signal (one is enough to switch); a request slower than `timeoutMs` is answered with 504 and counts as a timeout (a second, different signal is needed to switch).
- **Local pre-flight checks**, critical unless noted: required env vars, each endpoint reachable within its latency budget, the scripted test-account login, and free disk space. OBS is reported as not checked (video switching is not part of this build).
- **Hotkeys in its terminal:** `p` Panic, `r` Resume, `f` Freeze, `q` quit. The DemoGuard page also has Shift+P, Shift+R and Shift+F.

## Run it

1. Copy `stage-ready.demoguard.example.json` to `stage-ready.demoguard.json` in the folder you run the command from, and edit it for your demo app.
2. Open the project's DemoGuard page, start pre-flight, then press **Copy companion command**.
3. Paste it in a terminal at the repo root:

```bash
pnpm companion --url 'ws://localhost:4000/ws?token=…' --config stage-ready.demoguard.json
```

4. Open your demo through the proxy (`http://127.0.0.1:8787` with the example config) so its requests are seen.

The command's token lasts 15 minutes; copy a fresh one to reconnect.

## Config fields

| Field           | Default | Meaning                                                                                        |
| --------------- | ------- | ---------------------------------------------------------------------------------------------- |
| `target`        | none    | The demo app the proxy forwards to. Without it, network signals are off.                       |
| `proxyPort`     | 8787    | Local port of the proxy (binds 127.0.0.1 only).                                                |
| `timeoutMs`     | 5000    | Requests slower than this count as timeouts.                                                   |
| `requiredEnv`   | `[]`    | Env var names that must be set on the presenter machine.                                       |
| `endpoints`     | `[]`    | `{ url, budgetMs }`: each must answer under 500, within its budget (over budget is a warning). |
| `login`         | none    | `{ url, method, headers, body, expectStatus }`: the scripted test-account login.               |
| `minFreeDiskGb` | 5       | Free space needed in the current folder's disk.                                                |
