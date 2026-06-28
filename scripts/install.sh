#!/usr/bin/env bash
# Project Ledger · 60-second installer.
#
# Usage (post-launch, once npm package is published):
#   curl -sSL https://github.com/askledger/receipts-sdk | bash
#
# Usage today (pre-launch):
#   git clone https://github.com/askledger/receipts-sdk
#   cd receipts-sdk && npm install && npm run build && npm link
#   pl quickstart
#
# What it does:
#   1. Verifies Node >= 18 is available.
#   2. Installs @askledger/receipts-sdk globally (or to ~/.askledger/bin).
#   3. Runs `pl quickstart` to generate a keypair, sign a sample receipt,
#      verify it, and print the badge URL.
#
# Idempotent. Re-running upgrades to the latest release.

set -euo pipefail

PL_INSTALL_DIR="${PL_INSTALL_DIR:-$HOME/.askledger}"
PL_BIN="$PL_INSTALL_DIR/bin"
COLOR_GREEN=$'\033[0;32m'
COLOR_RED=$'\033[0;31m'
COLOR_RESET=$'\033[0m'

say()  { printf "%s\n" "$*"; }
ok()   { printf "%s✓%s %s\n" "$COLOR_GREEN" "$COLOR_RESET" "$*"; }
die()  { printf "%s✗%s %s\n" "$COLOR_RED" "$COLOR_RESET" "$*" >&2; exit 1; }

require_node() {
  command -v node >/dev/null 2>&1 || die "Node.js >= 18 required. Install from https://nodejs.org"
  local v
  v=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
  [ "$v" -ge 18 ] || die "Node $v detected; need >= 18."
  ok "Node $v"
}

install_cli() {
  if command -v pl >/dev/null 2>&1; then
    ok "pl already on PATH; upgrading"
  fi
  mkdir -p "$PL_BIN"
  npm install --prefix "$PL_INSTALL_DIR" --silent --no-audit --no-fund @askledger/cli@latest
  ln -sf "$PL_INSTALL_DIR/node_modules/.bin/pl" "$PL_BIN/pl"
  ok "Installed pl → $PL_BIN/pl"
}

ensure_path() {
  case ":$PATH:" in
    *":$PL_BIN:"*) return 0 ;;
  esac
  local rc="${SHELL##*/}rc"
  local profile="$HOME/.$rc"
  [ -f "$HOME/.zshrc" ] && profile="$HOME/.zshrc"
  [ -f "$HOME/.bashrc" ] && profile="$HOME/.bashrc"
  printf '\nexport PATH="%s:$PATH"   # added by askledger installer\n' "$PL_BIN" >> "$profile"
  export PATH="$PL_BIN:$PATH"
  ok "Added $PL_BIN to $profile (run: source $profile)"
}

run_quickstart() {
  PATH="$PL_BIN:$PATH" pl quickstart || die "quickstart failed"
}

say ""
say "Project Ledger · installing in $PL_INSTALL_DIR"
say "────────────────────────────────────────────"
require_node
install_cli
ensure_path
run_quickstart
say ""
say "Done. Next steps:"
say "  · pl sign  --event events.json --key ~/.askledger/keys/default.json"
say "  · pl verify --receipt receipt.json"
say "  · pl init  --tenant=my-company  (set up a real tenant)"
say ""
say "Docs:    https://github.com/askledger/receipts-sdk#readme"
say "Spec:    https://github.com/askledger/receipts-sdk/tree/main/spec"
say "Verify:  https://askledger.github.io/receipts-sdk/verify.html"
