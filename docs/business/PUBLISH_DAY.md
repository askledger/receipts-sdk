# Publication day · step-by-step runbook

A Saturday-morning script. ~4-6 hours total wall-clock. Stop after
Phase 5 if you only want soft-launch; continue to Phase 7 for full
public launch.

Each phase ends with a checkpoint. You can pause indefinitely between
phases without losing work. Everything below Phase 4 is reversible.

---

## Pre-flight · decide these BEFORE you open a terminal

These are the only choices that matter today. Spend 15 minutes on
them; do not optimise further.

| Decision | Recommendation | Why |
|---|---|---|
| Brand name | **AskLedger** (per your other product family) — "Project Ledger" stays the technical project name | Portfolio consistency; minor semantic friction is acceptable |
| Primary TLD | **`.org`** (~$10) | Standards-body credibility; same TLD as openssf.org, w3c.org |
| GitHub org | `askledger` (or `projectledger` if taken) | Match the brand or stay independent — both work |
| npm org | `askledger` (or `projectledger`) | Same |
| Public email | A Gmail / Outlook address you control today | Replace `hello@projectledger.io` everywhere in the repo |
| Stage 1 review group | 3 senior engineers in your network | Decide names now; messaging happens in Phase 7 |

If `askledger.org` is taken when you check, fall back order:
`askledger.dev` → `askledger.com` → `pl-receipts.org` → `pledger.org`.

---

## Phase 1 · Accounts (45 minutes · one-time)

### 1.1 Register the domain (~$10)

Go to **Cloudflare Registrar** (cheapest, no upsells):
- https://dash.cloudflare.com → Domain Registration → Register
- Search `askledger.org` (or your fallback)
- Add to cart, complete checkout
- DNS is automatically managed by Cloudflare

### 1.2 Create the GitHub organisation (free, 5 minutes)

- https://github.com/organizations/plan → "Free" tier
- Organisation name: `askledger`
- Enable 2FA on the account (required)
- Add yourself as Owner

### 1.3 Create the npm organisation (free, 3 minutes)

- https://www.npmjs.com/org/create
- Org name: `askledger`
- Enable 2FA on your npm account
- Generate an automation access token (Settings → Access Tokens →
  "Generate New Token" → "Automation" type) — save this securely;
  you'll need it in Phase 4

### 1.4 Set up Cloudflare DNS for the domain (10 minutes)

In Cloudflare Dashboard → your domain → DNS:
- Verify Cloudflare nameservers are active (should be automatic for
  Cloudflare Registrar)
- Add these CNAME records (point at your GitHub username):
  - `spec` → `askledger.github.io`
  - `verify` → `askledger.github.io`
  - `get` → `askledger.github.io`

**Checkpoint:** You now own the domain. You have a public GitHub org.
You have an npm org. None of this has touched the code yet.

---

## Phase 2 · Brand find-and-replace in the repo (15 minutes)

Open the repo locally. Run:

```bash
cd "/Users/alirashedkhan/Desktop/project ledger/receipts-sdk"

# Replace the brand name everywhere (Project Ledger → AskLedger)
find . -type f \( -name "*.md" -o -name "*.html" -o -name "*.ts" -o -name "*.tsx" -o -name "*.json" \) \
  -not -path "./node_modules/*" -not -path "./.next/*" -not -path "./dist/*" -not -path "./console/.next/*" \
  -exec sed -i '' 's/Project Ledger/AskLedger/g' {} +

# Replace the package scope (@projectledger → @askledger)
find . -type f \( -name "*.json" -o -name "*.md" -o -name "*.ts" \) \
  -not -path "./node_modules/*" -not -path "./dist/*" \
  -exec sed -i '' 's/@projectledger/@askledger/g' {} +

# Replace the GitHub org name
find . -type f \( -name "*.md" -o -name "*.html" -o -name "*.yml" -o -name "*.json" \) \
  -not -path "./node_modules/*" -not -path "./dist/*" \
  -exec sed -i '' 's|projectledger/receipts-sdk|askledger/receipts-sdk|g' {} +

# Replace the email and domain
find . -type f \( -name "*.md" -o -name "*.html" -o -name "*.ts" \) \
  -not -path "./node_modules/*" -not -path "./dist/*" \
  -exec sed -i '' 's/projectledger\.io/askledger.org/g' {} +
```

If you keep "Project Ledger" as the project name (recommended in the
dual-brand model), skip the first command — leave the technical name
intact and only change `@projectledger` → `@askledger` for npm and
`projectledger.io` → `askledger.org` for the domain.

After running, verify the build is still clean:

```bash
npm run build
npx vitest run --reporter=basic 2>&1 | tail -3
```

**Checkpoint:** Tests still pass. The brand is now your brand.

---

## Phase 3 · Push to GitHub (private first · 20 minutes)

### 3.1 Initialise git locally

```bash
cd "/Users/alirashedkhan/Desktop/project ledger/receipts-sdk"

# If git is not yet initialised:
git init
git add .
git commit -m "Initial public release · v0.6.0"
```

If git history exists, just stage and commit normally.

### 3.2 Create the repo on GitHub — START PRIVATE

- https://github.com/organizations/askledger/repositories/new
- Repo name: `receipts-sdk`
- Description: "Open-source cryptographic substrate for AI Decision Receipts. Apache-2.0."
- **Visibility: PRIVATE** (we flip to public in Phase 6)
- Do NOT add README, .gitignore, or LICENSE (we have ours)

### 3.3 Push

```bash
git remote add origin https://github.com/askledger/receipts-sdk.git
git branch -M main
git push -u origin main
```

### 3.4 Configure branch protection (5 minutes)

- Settings → Branches → Add rule for `main`
- Require pull request reviews · 1 reviewer
- Require status checks · CI

**Checkpoint:** The code is on GitHub, private. Nothing public yet.
You can pause here for days while you do the trusted-engineer review
in Phase 4.

---

## Phase 4 · Stage 1 review (3 days · soft pause)

### 4.1 Email 3 trusted senior engineers

Use this exact template:

> Subject: 20 minutes? Architecture read on something I built
>
> Hi [name],
>
> Quick favour. I've spent the last six months building an open-
> source cryptographic substrate for AI accountability. Planning to
> publish next weekend.
>
> Before I do, would you spend 20 minutes looking at the repo and
> telling me what would embarrass me? Anything broken, anything
> unconvincing, anything missing.
>
> Repo: github.com/askledger/receipts-sdk (private — added you as
> collaborator). README is the entry point; takes 3 minutes to scan.
>
> Honest reactions help more than polite ones.

Add each one as a collaborator on the private repo (Settings →
Collaborators → Add people).

### 4.2 Wait 3-5 days. Fix what they flag.

**Checkpoint:** You've had three independent reviewers look at the
work. If they all said "looks good" — you're ready for the public
flip. If one flagged something important, you fixed it.

---

## Phase 5 · Flip public + tag v0.6.0 (45 minutes)

### 5.1 Make the repo public

- Repo Settings → General → scroll to "Danger Zone"
- Change visibility → Public
- Type the repo name to confirm

### 5.2 Enable GitHub Pages

- Settings → Pages
- Source: Deploy from a branch
- Branch: `main` / folder: `/site` (where the playground and verifier live)
- Add custom domain: `verify.askledger.org`

### 5.3 Push the spec to a separate Pages site

```bash
cd spec
git subtree push --prefix=spec origin gh-pages
```

Configure spec.askledger.org → gh-pages branch in Pages settings.

### 5.4 Set up the npm publish secret

- GitHub repo → Settings → Secrets and variables → Actions
- Add `NPM_TOKEN` with the automation token from Phase 1.3

### 5.5 Tag v0.6.0

```bash
git tag -a v0.6.0 -m "Initial public release"
git push origin v0.6.0
```

### 5.6 Watch `release.yml` run

- Actions tab → watch the release workflow
- It will: build, run tests, run the hardening verifier, publish to
  npm with Sigstore provenance, build and sign a container image
  with cosign keyless, generate SLSA L3 provenance, create a GitHub
  release with notes from CHANGELOG.md

If anything breaks: do not panic. CI workflows always break on first
run. The most common issue is an environment variable or permission.
Fix the workflow file, push the fix, re-tag with `git tag -d v0.6.0
&& git push origin :v0.6.0 && git tag v0.6.0 && git push origin
v0.6.0`.

### 5.7 Verify the npm publish worked

- https://www.npmjs.com/package/@askledger/receipts-sdk
- Try `npm install @askledger/receipts-sdk` on a fresh terminal

**Checkpoint:** The repo is public. v0.6.0 is signed and published.
A developer anywhere in the world can now `npm install` it.

**You can stop here.** Do not announce yet. Let it sit for 3-7 days
for any final issues to surface.

---

## Phase 6 · Soft launch (45 minutes)

After the 3-7 day cooldown, one polite announcement.

### 6.1 LinkedIn post

```
After 6 months of building, I'm publishing AskLedger today —
an open-source cryptographic substrate for AI Decision Receipts.

Every AI call inside a company becomes a signed, hash-chained,
independently verifiable receipt. For regulators, auditors,
customers, and insurers who need proof of what the AI actually did.

Apache-2.0. Five language SDKs. Drop-in proxy for any
OpenAI-compatible tool. Open specification (PL-RFC-001 through 010).

Built to the standard top regulated buyers will require by 2026.

If you build, sell, or evaluate AI infrastructure — I'd love your
honest reactions. Repo and spec linked in the comments.

#AI #OpenSource #Compliance #Cryptography
```

### 6.2 Send the brief to your real network

Use the templates in `docs/business/OUTREACH_EMAILS.md`. Five emails
the first day. Five more the second. Stop at ten.

### 6.3 Update LinkedIn profile

Add "Founder · AskLedger" to your headline. This will trigger algorithmic
discovery for the next two weeks.

**Checkpoint:** Friendly network knows. Wider audience does not yet.

---

## Phase 7 · Public launch (when you're ready)

### 7.1 File the LiteLLM PR

Follow `integrations/litellm/UPSTREAM_PR.md`. The PR template is
ready to go. Once merged, LiteLLM users (trillions of tokens/month)
discover the project automatically.

### 7.2 Submit the LF AI Sandbox application

Use `docs/strategy/LF_AI_SUBMISSION.md`. Email it to
`tac@lfai.foundation`. Acceptance takes 30-90 days.

### 7.3 Show HN

- https://news.ycombinator.com/submit
- Title: `Show HN: AskLedger – open-source cryptographic substrate for AI receipts`
- URL: the GitHub repo
- Comment first: paste the 2-paragraph intro from `PROJECT_LEDGER_ONE_PAGER.md`

Post Tuesday or Wednesday between 8-10am PT for maximum visibility.

### 7.4 Tweet thread

5-7 tweets. Lead with the problem (AI vendor logs are mutable + EU
AI Act). Show the receipt. Show the verifier in browser. Link the
spec. Link the repo. End with "Apache-2.0, looking for design
partners in BFSI, insurance, healthcare."

### 7.5 Email Bandar Naghi a final follow-up

Use template 6 from `OUTREACH_EMAILS.md`. Mention the public launch.
Now there's something to point at.

**Checkpoint:** AskLedger is in the world. The 12-18 month standards-
adoption window starts ticking.

---

## What to do if things go wrong

### "release.yml failed on first run"
Almost certain on first attempt. Most common causes:
- `NPM_TOKEN` not set or expired → re-create in npm dashboard, set in
  GitHub secrets
- Cosign keyless requires OIDC — ensure `id-token: write` permission
  is set in the workflow (already set in our `release.yml`)
- SLSA generator needs `actions: read, contents: write, packages:
  write` (already set)

Fix the workflow, push, re-tag.

### "Domain DNS not resolving yet"
Cloudflare DNS propagates in minutes. If `dig spec.askledger.org` shows
nothing after 30 minutes, check the CNAME points at
`askledger.github.io` (no `https://`, no trailing slash).

### "Someone on HN said something harsh"
Read it once. If it's correct, thank them publicly and fix it. If
it's hostile noise, ignore it. Do not engage. The thread will move on.

### "A reviewer found a real bug after publication"
Apologise, fix it, ship v0.6.1, post a one-line release note. Real
projects get bug reports. Sigstore had a CVE in its first year. You
will survive.

---

## The single line that matters

You have built something that survives scrutiny. The remaining work
is administrative and reversible. **Start at Phase 1 this Saturday.
By Sunday evening you will have done more for the project than any
amount of additional building would do.**
