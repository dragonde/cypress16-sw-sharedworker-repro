# Cypress 16 native network: service worker + SharedWorker stall

Minimal reproduction for a Cypress 16 issue in Chrome on the native (proxy-less) network path. A page
that registers a **service worker** and creates a **`SharedWorker`** stalls across `cy.visit()` calls.
With `forceHttp1: true` it does not.

It needs no framework: a dependency-free Node server and one spec. Cypress is the only package.

## Run

```bash
npm install
SW=1 bash run.sh native 6                     # reproduces: most tests time out loading the page
SW=1 bash run.sh http1 6                      # forceHttp1: all pass
NO_SHARED_WORKER=1 SW=1 bash run.sh native 6  # no SharedWorker: all pass
SW=1 TAG=dbg bash dbgrun.sh native 3          # with Cypress's CDP debug log in run-dbg.log
```

`run.sh` starts the server, runs one mode, and prints:
- visits where the worker never sent the page a message;
- the time from `new SharedWorker()` to the worker's first message;
- the SSE streams the server saw.

`dbgrun.sh` also sets `ELECTRON_ENABLE_LOGGING=1` and `DEBUG=cypress:server:browsers:browser-cri-client`.
Without `ELECTRON_ENABLE_LOGGING=1`, Cypress 16 does not show the `DEBUG` output.

## Files

| File | Role |
|---|---|
| `server.js` | `:4300`: `/` and `/other` (the same page), `/worker.js`, `/sw.js`, `/api/context`. `:4301`: `/sse` (logs every open and close to `sse-server.log`) |
| `public/index.html` | Registers `/sw.js` (with `SW=1`) and creates `new SharedWorker('/worker.js')`. Registers with the worker, answers `PING`/`URL_REQUEST`, and logs every worker message in `window.__log` |
| `public/worker.js` | SharedWorker holding one `EventSource` for all pages. It asks a page for the URL and pings pages every 5 s |
| `public/sw.js` | Asset-cache service worker: `skipWaiting`, `clients.claim`, and a `fetch` listener that answers only cacheable GETs |
| `cypress/e2e/repro.cy.js` | Three `cy.visit()`s per test (`/` → `/other` → `/`) with a 5 s dwell each. Prints one `VISIT {json}` line per visit |
| `analyze.py` | Summarises a run log plus the server's SSE log |

Optional switches (environment): `TLS=1` (HTTPS + HTTP/2 with a self-signed cert; Chrome gets
`--ignore-certificate-errors` so the service worker can register), `SCRIPTS=n`, `FETCHES=n`,
`CROSS_ASSETS=1`, `DOC_DELAY_MS`, `WORKER_DELAY_MS`, `CONTEXT_DELAY_MS`, `INTERCEPT=1`, `RESET=1`,
`DWELL_MS`, `CHROME_ARGS`.

## Results (Cypress 16.2.1, Chrome 152, macOS, 6 iterations each)

| Variant | Native | `forceHttp1` |
|---|---|---|
| Service worker + `SharedWorker` | **5 / 6 tests fail** (`Timed out after waiting 60000ms for your remote page to load`) | **0 / 6** |
| Service worker only | 0 / 6 | — |
| `SharedWorker` only | 0 stalled visits | — |
