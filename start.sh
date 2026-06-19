#!/usr/bin/env bash
set -e

cd "$(dirname "$0")"

echo "🥊 BoxingCat — starting Tauri dev (frontend + backend)"
echo ""

pnpm tauri dev
