#!/usr/bin/env bash
# Usage: ./scripts/wait-for-healthy.sh http://localhost:3003/health 60
set -euo pipefail
URL="$1"; TIMEOUT="${2:-60}"
for i in $(seq 1 "$TIMEOUT"); do
  if curl -sf "$URL" > /dev/null 2>&1; then echo "healthy: $URL"; exit 0; fi
  sleep 1
done
echo "timed out waiting for $URL" >&2
exit 1
