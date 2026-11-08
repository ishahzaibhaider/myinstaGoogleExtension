#!/bin/sh
# Syntax-checks every JavaScript file and validates the manifest. No dependencies.
set -e
cd "$(dirname "$0")/.."
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT
fail=0
for f in extension/engine.js extension/gestures.js extension/fx/*.js; do
  cp "$f" "$tmp/check.mjs"                       # ES modules
  node --check "$tmp/check.mjs" || { echo "✗ $f"; fail=1; }
done
for f in extension/inject.js extension/bridge.js extension/popup.js tools/visual-test/*.js; do
  node --check "$f" || { echo "✗ $f"; fail=1; }
done
node -e "JSON.parse(require('fs').readFileSync('extension/manifest.json','utf8'))" || { echo "✗ manifest.json"; fail=1; }
[ "$fail" = 0 ] && echo "✓ all checks passed"
exit "$fail"
