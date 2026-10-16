#!/usr/bin/env bash
# Assemble the installable plugin (built files plus a runtime-only package.json) into $1.
set -euo pipefail
out="$1"
rm -rf "$out" && mkdir -p "$out"
cp -r dist README.md LICENSE "$out/"
node -e '
const p = require("./package.json")
delete p.scripts
delete p.devDependencies
require("fs").writeFileSync(process.argv[1] + "/package.json", JSON.stringify(p, null, 2) + "\n")
' "$out"
