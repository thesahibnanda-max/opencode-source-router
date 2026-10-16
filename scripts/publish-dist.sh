#!/usr/bin/env bash
# Force-push the assembled plugin to the `dist` branch of $REPO. Runs in CI only.
set -euo pipefail
out="$1"
bash "$(dirname "$0")/assemble-dist.sh" "$out"
cd "$out"
git init -q -b dist
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git add -A
git commit -q -m "build: ${GITHUB_SHA:-local}"
git push -f "https://x-access-token:${GITHUB_TOKEN}@github.com/${REPO}.git" dist
