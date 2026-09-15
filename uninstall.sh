#!/bin/sh
set -eu
PREFIX=${CODEX_QUOTA_PREFIX:-"$HOME/.local"}
rm -f "$PREFIX/bin/codex-quota" "$PREFIX/bin/cq"
rm -rf "$PREFIX/share/codex-quota-coach"
echo "Removed Codex Quota Coach executable."
echo "Usage history was left untouched."
