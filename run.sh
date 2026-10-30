#!/usr/bin/env bash
# Start the local server, run the spec in one network mode, stop the server, analyse.
# Usage: bash run.sh native|http1 [iterations] [browser]    (TLS=1: HTTPS + HTTP/2 with a self-signed cert)
set -euo pipefail
cd "$(dirname "$0")"
mode="${1:?native|http1}"; iterations="${2:-5}"; browser="${3:-chrome}"; tag="${TAG:-$mode}"
rm -f sse-server.log
if [ "${TLS:-0}" = 1 ] && [ ! -f certs/cert.pem ]; then
  mkdir -p certs
  openssl req -x509 -newkey rsa:2048 -nodes -days 30 -subj /CN=localhost -addext subjectAltName=DNS:localhost \
    -keyout certs/key.pem -out certs/cert.pem 2>/dev/null
fi
node server.js > server.out 2>&1 &
server=$!
trap 'kill $server 2>/dev/null || true' EXIT
for _ in $(seq 1 50); do nc -z localhost 4300 && break; sleep 0.1; done
MODE="$mode" ITERATIONS="$iterations" npx cypress run --browser "$browser" --headless 2>&1 | tee "run-$tag.log" | grep -E "Tests:|Passing|Failing|forceHttp1" || true
mv sse-server.log "sse-server-$tag.log"
python3 -I analyze.py "run-$tag.log" "sse-server-$tag.log"
