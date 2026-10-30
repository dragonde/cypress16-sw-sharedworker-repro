// Minimal, dependency-free server for the SharedWorker + EventSource reproduction.
//
// :4300  app origin  — two HTML pages (/ and /other), /worker.js, /api/context, /sw.js (SW=1), and optional page weight:
//                      /static/a<i>.js (cacheable scripts) and /api/data?i (slow fetches)
// :4301  SSE origin  — /sse (cross-origin, like a separate notifications host)
//
// Every SSE open/close is appended to sse-server.log as one JSON line: {t, ev, id}.
// Usage: node server.js            (env: CONTEXT_DELAY_MS, default 300; TLS=1 serves both origins over
// HTTPS with HTTP/2 (HTTP/1.1 fallback), using certs/key.pem + certs/cert.pem — see run.sh)

const http = require("http");
const http2 = require("http2");
const fs = require("fs");
const path = require("path");

const APP_PORT = 4300;
const SSE_PORT = 4301;
const CONTEXT_DELAY_MS = Number(process.env.CONTEXT_DELAY_MS || 300);
const SCRIPTS = Number(process.env.SCRIPTS || 0); // cacheable <script>s per page, like an SPA's bundles
const FETCHES = Number(process.env.FETCHES || 0); // API calls the page makes on load
const DATA_DELAY_MS = Number(process.env.DATA_DELAY_MS || 150);
const DOC_DELAY_MS = Number(process.env.DOC_DELAY_MS || 0); // delay the HTML response (slow navigation)
const CROSS_ASSETS = process.env.CROSS_ASSETS === "1"; // serve the page's scripts from the other origin (an asset host)
const NO_SHARED_WORKER = process.env.NO_SHARED_WORKER === "1"; // page creates no SharedWorker (service-worker-only variant)
const SW = process.env.SW === "1"; // register a service worker (/sw.js) on every page
const WORKER_DELAY_MS = Number(process.env.WORKER_DELAY_MS || 0); // delay the worker script response
const LOG = path.join(__dirname, "sse-server.log");

const TLS = process.env.TLS === "1";
const SCHEME = TLS ? "https" : "http";
const createServer = (handler) =>
  TLS
    ? http2.createSecureServer(
        {
          allowHTTP1: true,
          key: fs.readFileSync(path.join(__dirname, "certs", "key.pem")),
          cert: fs.readFileSync(path.join(__dirname, "certs", "cert.pem")),
        },
        handler
      )
    : http.createServer(handler);

const log = (ev, extra = {}) => fs.appendFileSync(LOG, JSON.stringify({ t: Date.now(), ev, ...extra }) + "\n");

const weight =
  Array.from({ length: SCRIPTS }, (_, i) =>
    CROSS_ASSETS ? `<script src="${SCHEME}://localhost:${SSE_PORT}/static/a${i}.js"></script>` : `<script src="/static/a${i}.js?v=1"></script>`
  ).join("") +
  `<script>for (let i = 0; i < ${FETCHES}; i++) fetch("/api/data?i=" + i);</script>` +
  (NO_SHARED_WORKER ? `<script>window.__noSharedWorker = true;</script>` : "") +
  (SW ? `<script>if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");</script>` : "");
const page = fs.readFileSync(path.join(__dirname, "public", "index.html"), "utf8").replace("<!--WEIGHT-->", weight);
const bundle = `/* filler */ window.__filler = (window.__filler || 0) + 1; //${"x".repeat(200000)}`;
const bundleLastModified = new Date(Date.now() - 30 * 24 * 3600 * 1000).toUTCString();
const worker = fs.readFileSync(path.join(__dirname, "public", "worker.js"));
const sw = fs.readFileSync(path.join(__dirname, "public", "sw.js"));
const workerStat = fs.statSync(path.join(__dirname, "public", "worker.js"));
const workerEtag = `"${workerStat.size}-${Math.round(workerStat.mtimeMs)}"`;
const workerLastModified = workerStat.mtime.toUTCString();

createServer((req, res) => {
  const url = new URL(req.url, `${SCHEME}://${req.headers.host || req.headers[":authority"]}`);
  if (url.pathname === "/" || url.pathname === "/other") {
    return setTimeout(() => {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(page);
    }, DOC_DELAY_MS);
  }
  if (url.pathname === "/worker.js") {
    // Like the original: validators but no Cache-Control, so the browser applies heuristic freshness.
    return setTimeout(() => {
      if (req.headers["if-none-match"] === workerEtag) {
        res.writeHead(304, { ETag: workerEtag, "Last-Modified": workerLastModified });
        return res.end();
      }
      res.writeHead(200, {
        "Content-Type": "application/javascript",
        ETag: workerEtag,
        "Last-Modified": workerLastModified,
      });
      res.end(worker);
    }, WORKER_DELAY_MS);
  }
  if (url.pathname === "/sw.js") {
    res.writeHead(200, { "Content-Type": "application/javascript", "Cache-Control": "no-cache" });
    return res.end(sw);
  }
  if (url.pathname.startsWith("/static/")) {
    // Bundles: validators, an old Last-Modified and no Cache-Control, so they are heuristically fresh.
    const etag = `"${url.pathname}"`;
    if (req.headers["if-none-match"] === etag) {
      res.writeHead(304, { ETag: etag, "Last-Modified": bundleLastModified });
      return res.end();
    }
    res.writeHead(200, { "Content-Type": "application/javascript", ETag: etag, "Last-Modified": bundleLastModified });
    return res.end(bundle);
  }
  if (url.pathname === "/api/data") {
    return setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ i: url.searchParams.get("i") }));
    }, DATA_DELAY_MS);
  }
  if (url.pathname === "/api/context") {
    // Stands in for the app's context call that the page waits on before answering URL_REQUEST.
    return setTimeout(() => {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      res.end(JSON.stringify({ sseUrl: `${SCHEME}://localhost:${SSE_PORT}/sse` }));
    }, CONTEXT_DELAY_MS);
  }
  res.writeHead(404);
  res.end();
})
.listen(APP_PORT, () => console.log(`app on ${SCHEME}://localhost:${APP_PORT}`));

let nextId = 1;
createServer((req, res) => {
  const origin = req.headers.origin || `${SCHEME}://localhost:${APP_PORT}`;
  const cors = { "Access-Control-Allow-Origin": origin, "Access-Control-Allow-Credentials": "true" };
  if (req.url.startsWith("/static/")) {
    res.writeHead(200, { ...cors, "Content-Type": "application/javascript", ETag: `"${req.url}"`, "Last-Modified": bundleLastModified });
    return res.end(bundle);
  }
  if (!req.url.startsWith("/sse")) {
    res.writeHead(404, cors);
    return res.end();
  }
  const id = nextId++;
  log("open", { id, proto: req.httpVersion });
  res.writeHead(200, { ...cors, "Content-Type": "text/event-stream", "Cache-Control": "no-cache" });
  res.write(": connected\n\n");
  const tick = setInterval(() => res.write(`data: ${JSON.stringify({ type: "TICK", value: Date.now() })}\n\n`), 2000);
  req.on("close", () => {
    clearInterval(tick);
    log("close", { id });
  });
})
.listen(SSE_PORT, () => console.log(`sse on ${SCHEME}://localhost:${SSE_PORT}/sse`));
