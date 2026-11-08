#!/bin/sh
# Builds dist/infinity-fx-<version>.zip, ready to share or to upload as a release asset.
set -e
cd "$(dirname "$0")/.."
version="$(node -p "require('./extension/manifest.json').version")"
mkdir -p dist
out="dist/infinity-fx-$version.zip"
rm -f "$out"
(cd extension && zip -qr "../$out" . -x '.*' -x '*/.*')
echo "✓ $out ($(du -h "$out" | cut -f1))"
