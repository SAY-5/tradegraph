#!/usr/bin/env bash
# wait-for.sh URL [SECONDS]: poll URL until it answers 2xx or time out.
set -euo pipefail
url="$1"
limit="${2:-60}"
for ((i = 0; i < limit; i++)); do
    code=$(curl -s -o /dev/null -w '%{http_code}' "$url" || true)
    if [[ "$code" =~ ^2 ]]; then
        echo "ready: $url ($code)"
        exit 0
    fi
    sleep 1
done
echo "timeout waiting for $url" >&2
exit 1
