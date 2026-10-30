#!/usr/bin/env bash
# Like run.sh, plus Cypress's CDP target log, and counts of crash-reloaded service workers.
set -euo pipefail
cd "$(dirname "$0")"
ELECTRON_ENABLE_LOGGING=1 DEBUG='cypress:server:browsers:browser-cri-client' bash run.sh "$@"
tag="${TAG:-$1}"
echo "service_worker attaches: $(grep -c "type: 'service_worker'" "run-$tag.log")  shared_worker attaches: $(grep -c "type: 'shared_worker'" "run-$tag.log")  crash-reloads: $(grep -c 'crash-release' "run-$tag.log")"
