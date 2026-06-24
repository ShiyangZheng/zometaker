#!/usr/bin/env bash
#
# Build Zometaker as a Zotero .xpi plugin.
#
# Usage:
#   ./build.sh                    # writes ../zometaker.xpi
#   ./build.sh /tmp/output.xpi    # writes to a custom path

set -euo pipefail

PLUGIN_ID="zometaker"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_PATH="${1:-${SCRIPT_DIR}/../${PLUGIN_ID}.xpi}"

cd "${SCRIPT_DIR}"

# Remove previous build
rm -f "${OUT_PATH}"

# Zip. Use -X to strip extra attributes (e.g. macOS resource forks) that
# confuse Zotero's installer. Exclude dev-only files.
zip -rX "${OUT_PATH}" . \
  -x "build.sh" \
     "*.md" \
     "*.bak" \
     "tests/*" \
     ".git/*" \
     ".DS_Store" \
     "node_modules/*"

echo "Built ${OUT_PATH}"
ls -lh "${OUT_PATH}"