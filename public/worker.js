// SharedWorker that holds one EventSource for every page of the origin.
// - On the first connect it asks the most recently seen page for the stream URL (URL_REQUEST, 5 s timeout).
// - It PINGs every page every 5 s; a page is stale after 10 s without PONG (unless its presence lock is held).
// - It closes the stream when no page is responsive and reopens it on the next PONG.
// - Stream messages fan out to every page.

const CLIENT_TIMEOUT = 10000;
const HEALTHCHECK_INTERVAL = 5000;

const clients = new Map();
let source = null;
let connecting = false;

self.addEventListener("connect", (e) => {
  const port = e.ports[0];
  clients.set(port, { lastPong: Date.now(), lockName: null });
  if (source === null) connectEventSource();

  port.addEventListener("message", (m) => {
    const state = clients.get(port);
    if (!state) return;
    if (m.data.type === "REGISTER_CLIENT") {
      state.lockName = m.data.value.lockName;
      state.lastPong = Date.now();
    }
    if (m.data.type === "PONG") {
      state.lastPong = Date.now();
      if (source === null) connectEventSource();
    }
  });
  port.start();
});

setInterval(async () => {
  const now = Date.now();
  let responsive = false;
  const stale = [];
  clients.forEach((state, port) => {
    port.postMessage({ type: "PING" });
    if (now - state.lastPong > CLIENT_TIMEOUT) stale.push(port);
    else responsive = true;
  });
  if (stale.length) {
    const held = await activeLockNames();
    stale.forEach((port) => {
      if (held === null || !held.has(clients.get(port).lockName)) clients.delete(port);
    });
  }
  if (!responsive && source) {
    source.close();
    source = null;
  }
}, HEALTHCHECK_INTERVAL);

function mostRecentClient() {
  let best = null;
  let bestPong = -Infinity;
  clients.forEach((state, port) => {
    if (state.lastPong > bestPong) {
      best = port;
      bestPong = state.lastPong;
    }
  });
  return best;
}

function getUrl() {
  return new Promise((resolve, reject) => {
    const port = mostRecentClient();
    if (!port) return reject(new Error("no clients"));
    const timeout = setTimeout(() => {
      port.removeEventListener("message", onMessage);
      reject(new Error("URL request timeout"));
    }, 5000);
    function onMessage(m) {
      if (m.data.type === "URL_RESPONSE") {
        clearTimeout(timeout);
        port.removeEventListener("message", onMessage);
        resolve(m.data.value);
      }
    }
    port.addEventListener("message", onMessage);
    port.postMessage({ type: "URL_REQUEST" });
  });
}

async function connectEventSource() {
  if (source || connecting) return;
  connecting = true;
  try {
    const url = await getUrl();
    source = new EventSource(url, { withCredentials: true });
    source.onmessage = (m) => clients.forEach((_s, port) => port.postMessage(JSON.parse(m.data)));
  } catch (err) {
    console.error(err);
  } finally {
    connecting = false;
  }
}

async function activeLockNames() {
  if (!self.navigator || !self.navigator.locks) return null;
  try {
    const snapshot = await self.navigator.locks.query();
    return new Set(snapshot.held.map((l) => l.name).filter(Boolean));
  } catch {
    return null;
  }
}
