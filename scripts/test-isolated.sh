#!/usr/bin/env bash
# Requires the pre-built toolchain image. No network or host home is exposed to tests.
set -euo pipefail
image="${1:-jarvis-ci}"
repo="$(cd "$(dirname "$0")/.." && pwd)"
container="jarvis-test-$$"
trap 'docker rm -f "$container" >/dev/null 2>&1 || true' EXIT
# timeout also bounds the Docker client; the trap removes a container left after a timeout.
timeout --signal=TERM 240s docker run --name "$container" --rm \
  --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
  --user 1000:1000 --cpus 2 --memory 768m --memory-swap 768m --pids-limit 128 \
  --ulimit nofile=256:256 --ulimit nproc=128:128 --ulimit fsize=67108864:67108864 --ulimit cpu=120:120 \
  --mount "type=bind,source=$repo,target=/src,readonly" \
  --tmpfs /scratch:rw,nosuid,nodev,size=256m,mode=1777 \
  "$image" env -i PATH=/usr/local/bin:/usr/bin:/bin HOME=/scratch/home TMPDIR=/scratch \
  PYTHONDONTWRITEBYTECODE=1 npm_config_cache=/scratch/npm-cache \
  sh -c 'mkdir -p "$HOME" && python3 scripts/check.py && python3 -m unittest discover -s tests -p "test_*.py" -v && node --test --test-concurrency=1 tests/*.test.mjs'
