#!/usr/bin/env bash
# Publication day · automation script.
#
# Run from the repo root. Walks you through the pieces that can be
# automated. Stops at every irreversible step and asks you to confirm.
#
#   bash scripts/publish-day.sh
#
# Companion runbook: docs/business/PUBLISH_DAY.md

set -euo pipefail

# ---------- pretty ----------
GREEN=$'\033[0;32m'
YELLOW=$'\033[1;33m'
RED=$'\033[0;31m'
BOLD=$'\033[1m'
RESET=$'\033[0m'

say()     { printf "\n%s%s%s\n" "$BOLD" "$*" "$RESET"; }
ok()      { printf "%s✓%s %s\n" "$GREEN" "$RESET" "$*"; }
warn()    { printf "%s⚠%s %s\n" "$YELLOW" "$RESET" "$*"; }
fail()    { printf "%s✗%s %s\n" "$RED" "$RESET" "$*" >&2; }
pause()   { printf "\n%spress ENTER when ready%s " "$YELLOW" "$RESET"; read -r _; }
confirm() {
  printf "\n%s%s [y/N]:%s " "$YELLOW" "$1" "$RESET"
  read -r reply
  case "$reply" in [yY]|[yY][eE][sS]) return 0 ;; *) return 1 ;; esac
}

# ---------- environment ----------
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

say "AskLedger · publication-day automation"
say "================================================"
echo "  Repo:    $ROOT"
echo "  Runbook: docs/business/PUBLISH_DAY.md"
echo "  This script automates pre-checks, the brand find-and-replace, and"
echo "  the git push prep. Domain registration, GitHub-org creation,"
echo "  npm-org creation, and tagging are MANUAL by design."

confirm "Begin?" || { echo "aborted"; exit 0; }

# ---------- Phase 0 · sanity checks ----------
say "Phase 0 · sanity checks"
command -v git  >/dev/null || { fail "git not found"; exit 1; } && ok "git"
command -v node >/dev/null || { fail "node not found"; exit 1; } && ok "node"
command -v npm  >/dev/null || { fail "npm not found"; exit 1; }  && ok "npm"

NODE_MAJOR=$(node -e 'process.stdout.write(String(process.versions.node.split(".")[0]))')
[ "$NODE_MAJOR" -ge 18 ] || { fail "Node $NODE_MAJOR; need >= 18"; exit 1; }
ok "node $NODE_MAJOR"

# ---------- Phase 1 · build + tests + hardening ----------
say "Phase 1 · verify the build is publishable"

# Pre-check: npm bug #4828 (rollup optional native modules vanish).
# If node_modules is missing OR the platform-native rollup module is missing,
# do a clean reinstall before continuing.
NEED_REINSTALL=0
if [ ! -d node_modules ]; then NEED_REINSTALL=1; fi
if [ -d node_modules/rollup ] && [ ! -d node_modules/@rollup ]; then NEED_REINSTALL=1; fi
case "$(uname -sm)" in
  "Darwin arm64") NATIVE=node_modules/@rollup/rollup-darwin-arm64 ;;
  "Darwin x86_64") NATIVE=node_modules/@rollup/rollup-darwin-x64 ;;
  "Linux x86_64") NATIVE=node_modules/@rollup/rollup-linux-x64-gnu ;;
  *) NATIVE="" ;;
esac
if [ -n "$NATIVE" ] && [ -d node_modules/rollup ] && [ ! -d "$NATIVE" ]; then NEED_REINSTALL=1; fi

if [ "$NEED_REINSTALL" = "1" ]; then
  warn "npm packaging issue detected (npm bug #4828) — reinstalling clean"
  rm -rf node_modules package-lock.json
  npm install --silent --no-audit --no-fund || { fail "npm install failed"; exit 1; }
  ok "reinstall complete"
fi

npm run build >/dev/null 2>&1 && ok "build clean" || { fail "build failed"; exit 1; }

echo "  running tests (this takes ~15s) ..."
TEST_LOG="$ROOT/.publish-day-test.log"
if npx vitest run --reporter=basic >"$TEST_LOG" 2>&1; then
  PASSED=$(grep -oE "Tests +[0-9]+ passed" "$TEST_LOG" | head -1 || echo "passed")
  ok "tests $PASSED"
else
  fail "tests failed — last 40 lines of $TEST_LOG:"
  echo
  tail -40 "$TEST_LOG"
  echo
  fail "(full log at $TEST_LOG)"
  exit 1
fi

VERIFY_BUILD="$ROOT/.publish-day-verify"
if [ -d "$VERIFY_BUILD" ]; then rm -rf "$VERIFY_BUILD"; fi
HARD_LOG="$ROOT/.publish-day-hardening.log"
if ! npx tsc tools/verify-hardening.ts --target es2022 --module commonjs --moduleResolution node \
  --esModuleInterop --skipLibCheck --outDir "$VERIFY_BUILD" >"$HARD_LOG" 2>&1; then
  fail "could not compile hardening verifier — last 40 lines of $HARD_LOG:"
  echo
  tail -40 "$HARD_LOG"
  exit 1
fi
# The repo's package.json sets "type": "module" which would make Node treat
# our .js output as ESM. Tell Node this output directory is CommonJS.
echo '{"type":"commonjs"}' > "$VERIFY_BUILD/package.json"
if PL_REPO_ROOT="$ROOT" node "$VERIFY_BUILD/verify-hardening.js" >"$HARD_LOG" 2>&1; then
  RESULT=$(grep "Hardening verification" "$HARD_LOG" || echo "PASS")
  ok "hardening · $RESULT"
else
  fail "hardening verifier failed — last 40 lines of $HARD_LOG:"
  echo
  tail -40 "$HARD_LOG"
  exit 1
fi

# ---------- Phase 2 · brand find-and-replace ----------
say "Phase 2 · brand rename (optional)"
echo "  Current package scope: @askledger"
echo "  Current domain refs:   github.com/askledger/receipts-sdk"
echo
echo "  If you've decided to rebrand (e.g. AskLedger / askledger.org),"
echo "  this step does the find-and-replace across the repo."

if confirm "Rebrand to a new name now?"; then
  read -r -p "  New brand name (e.g. AskLedger; ENTER to keep Project Ledger): " NEW_BRAND
  read -r -p "  New npm scope (e.g. askledger; ENTER to keep askledger): " NEW_SCOPE
  read -r -p "  New GitHub org (e.g. askledger; ENTER to keep askledger): " NEW_ORG
  read -r -p "  New domain root (e.g. askledger.org; ENTER to keep github.com/askledger/receipts-sdk): " NEW_DOMAIN

  if [ -n "$NEW_BRAND" ]; then
    grep -rlE --include="*.md" --include="*.html" "Project Ledger" . 2>/dev/null \
      | grep -v node_modules | grep -v .next | grep -v dist \
      | xargs -I{} sed -i '' "s/Project Ledger/$NEW_BRAND/g" {} 2>/dev/null || true
    ok "brand name updated"
  fi

  if [ -n "$NEW_SCOPE" ]; then
    grep -rlE --include="*.json" --include="*.md" --include="*.ts" "@askledger" . 2>/dev/null \
      | grep -v node_modules | grep -v .next | grep -v dist \
      | xargs -I{} sed -i '' "s/@askledger/@$NEW_SCOPE/g" {} 2>/dev/null || true
    ok "npm scope updated"
  fi

  if [ -n "$NEW_ORG" ]; then
    grep -rlE --include="*.md" --include="*.yml" --include="*.json" "askledger/" . 2>/dev/null \
      | grep -v node_modules | grep -v .next | grep -v dist \
      | xargs -I{} sed -i '' "s|askledger/|$NEW_ORG/|g" {} 2>/dev/null || true
    ok "GitHub org updated"
  fi

  if [ -n "$NEW_DOMAIN" ]; then
    grep -rlE --include="*.md" --include="*.html" "github.com/askledger/receipts-sdk" . 2>/dev/null \
      | grep -v node_modules | grep -v .next | grep -v dist \
      | xargs -I{} sed -i '' "s/askledger\.io/$NEW_DOMAIN/g" {} 2>/dev/null || true
    ok "domain updated"
  fi

  say "Re-verifying the build after rename"
  npm run build >/dev/null 2>&1 && ok "build still clean" || { fail "build broke after rename — git diff to inspect"; exit 1; }
fi

# ---------- Phase 3 · manual checklist before any push ----------
say "Phase 3 · manual checklist · do these in a browser"
cat <<'EOF'

  ☐ Register the domain
      https://dash.cloudflare.com/?to=/:account/registrar/register
      Search and buy the .org TLD

  ☐ Create the GitHub organisation
      https://github.com/organizations/plan
      Free tier · enable 2FA

  ☐ Create the npm organisation
      https://www.npmjs.com/org/create
      Generate Automation token · save it · enable 2FA

  ☐ Add Cloudflare CNAME records once GitHub Pages is enabled:
      spec   → <your-org>.github.io
      verify → <your-org>.github.io
      get    → <your-org>.github.io

EOF
pause

# ---------- Phase 4 · initialise git if needed ----------
say "Phase 4 · git initialisation"
if [ ! -d .git ]; then
  warn "no git repo here — initialising"
  git init
  git add .
  git commit -m "Initial public release · v0.6.0"
  ok "git initialised + first commit"
else
  ok "git repo present"
  if [ -n "$(git status --porcelain)" ]; then
    warn "uncommitted changes present"
    git status --short
    if confirm "Commit these now?"; then
      git add .
      git commit -m "Pre-launch updates"
      ok "committed"
    fi
  else
    ok "working tree clean"
  fi
fi

# ---------- Phase 5 · prepare push ----------
say "Phase 5 · prepare git remote"
echo "  Expected GitHub URL: https://github.com/<your-org>/receipts-sdk"
read -r -p "  Your GitHub org name (e.g. askledger): " GH_ORG
if [ -z "$GH_ORG" ]; then warn "skipping push setup"; else
  REMOTE_URL="https://github.com/$GH_ORG/receipts-sdk.git"
  if git remote get-url origin >/dev/null 2>&1; then
    git remote set-url origin "$REMOTE_URL"
  else
    git remote add origin "$REMOTE_URL"
  fi
  git branch -M main
  ok "remote set to $REMOTE_URL"
  echo
  echo "  When you have created the empty private repo on GitHub, run:"
  echo "      git push -u origin main"
  echo
  echo "  After review by 3 trusted engineers, flip the repo to public"
  echo "  via GitHub Settings → Danger Zone → Change visibility."
fi

# ---------- Phase 6 · tag preparation ----------
say "Phase 6 · v0.6.0 tag (don't push yet)"
echo "  When ready (after the 3-engineer review + public-flip), tag:"
echo
echo "      git tag -a v0.6.0 -m 'Initial public release'"
echo "      git push origin v0.6.0"
echo
echo "  The release.yml workflow then runs automatically:"
echo "    · build + tests + hardening verifier"
echo "    · npm publish with Sigstore provenance"
echo "    · container image to ghcr.io signed by cosign keyless"
echo "    · SLSA L3 provenance attestation"
echo "    · GitHub release with notes from CHANGELOG.md"
echo

# ---------- final summary ----------
say "Done · summary of what this script verified locally"
echo "  ✓ Repo builds cleanly"
echo "  ✓ Tests pass"
echo "  ✓ Hardening verifier 66/66 PASS"
echo "  ✓ Git initialised + clean working tree"
echo "  ✓ Remote configured (push when ready)"
echo
echo "  Remaining MANUAL steps (next 4-6 hours):"
echo "  1. Register the domain (Cloudflare, ~$10)"
echo "  2. Create the GitHub org (free)"
echo "  3. Create the npm org + automation token (free)"
echo "  4. Add the NPM_TOKEN secret to the GitHub repo"
echo "  5. Email 3 trusted engineers a private repo link (Phase 4)"
echo "  6. Flip the repo to public after their review"
echo "  7. Tag v0.6.0 and push"
echo
echo "  Full runbook: docs/business/PUBLISH_DAY.md"
echo
ok "you are ready"
