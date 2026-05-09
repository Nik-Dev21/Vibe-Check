# VibeCheck — 2-Person Dev Pipeline

---

## Updated Feature: Auto-Fix

After the scan report is generated, VibeCheck doesn't just tell you what's wrong —
it writes the fix for you.

```
CRITICAL — Line 23 — Hardcoded JWT secret

  Your code:
  const SECRET = 'mysecretkey123'

  Fixed code:
  const SECRET = process.env.JWT_SECRET

  [ Apply Fix ] [ View Diff ] [ Skip ]
```

User clicks **Apply Fix** → VibeCheck opens a GitHub PR with the patched code.
One click to merge. No manual editing required.

---

## Phase 0 — Shared Setup (Do Together, ~1 hour)

Both teammates do this before splitting.

```
1. Clone repo
   git clone https://github.com/yourname/vibecheck
   cd vibecheck

2. Install dependencies
   npm install

3. Copy env file — both fill in their own .env.local
   cp .env.example .env.local

4. Install Claude Code skills
   chmod +x install-skills.sh && ./install-skills.sh

5. Create shared branches
   git checkout -b dev          # integration branch
   git push origin dev

6. Verify IBM connections work
   npm run dev → hit /api/health

7. Split into streams (see below)
```

---

## The Split

```
                    ┌─────────────────────────────────┐
                    │     Phase 0 — Shared Setup      │
                    │     Both teammates together      │
                    └──────────────┬──────────────────┘
                                   │
                    ┌──────────────┴──────────────────┐
                    │                                  │
          ┌─────────▼────────┐             ┌──────────▼────────┐
          │   STREAM A       │             │   STREAM B        │
          │   Backend +      │             │   Frontend +      │
          │   AI Pipeline    │             │   UI + Auto-Fix   │
          └─────────┬────────┘             └──────────┬────────┘
                    │                                  │
          ┌─────────▼────────┐             ┌──────────▼────────┐
          │ branch:          │             │ branch:           │
          │ stream-a-backend │             │ stream-b-frontend │
          └─────────┬────────┘             └──────────┬────────┘
                    │                                  │
                    └──────────────┬───────────────────┘
                                   │
                    ┌──────────────▼──────────────────┐
                    │        PR into dev               │
                    │    Integration + final QA        │
                    └─────────────────────────────────┘
```

---

## Stream A — Backend & AI Pipeline

**Owner:** Teammate A
**Branch:** `stream-a-backend`

```bash
git checkout dev
git checkout -b stream-a-backend
```

### Tasks in order:

**A1 — IBM Clients** (`lib/ibm/`)
- `iam.ts` — IAM token fetcher with caching
- `watsonx.ts` — Granite deep scan client
- `nlu.ts` — Watson NLU README analyzer
- `cos.ts` — Cloud Object Storage report saver
- `cloudant.ts` — Cloudant scan summary saver

**A2 — Featherless Client** (`lib/featherless.ts`)
- OpenAI-compatible client pointed at featherless.ai
- Qwen2.5-Coder fast-pass classifier

**A3 — GitHub Fetcher** (`lib/github.ts`)
- Accept repo URL
- Fetch file tree via GitHub API
- Download contents of scannable files
- Filter: `.ts .js .py .env* .json .yaml .toml`

**A4 — Scan Pipeline** (`lib/scanner/`)
- `fast-pass.ts` — run all files through Featherless
- `deep-scan.ts` — run HIGH/MEDIUM files through watsonx.ai
- `context-layer.ts` — NLU enrichment on README
- `report-builder.ts` — assemble ScanReport object
- `index.ts` — orchestrate all 4 phases

**A5 — Auto-Fix Engine** (`lib/scanner/auto-fix.ts`)
- Accept a single Vulnerability object
- Send to watsonx.ai: "here is the vulnerable code, write the fix"
- Return: original snippet + fixed snippet + explanation

**A6 — API Routes** (`app/api/`)
- `POST /api/scan` — accept repo URL, run pipeline, return scanId
- `GET /api/scan/[scanId]` — fetch stored report from Cloudant
- `POST /api/fix` — accept vulnerabilityId, return auto-fix diff
- `POST /api/fix/push` — push fix as GitHub PR
- `GET /api/health` — verify all IBM service connections

**A7 — Types** (`lib/types.ts`)
- All shared TypeScript interfaces
- Push this first so Stream B can import from it

---

## Stream B — Frontend & UI

**Owner:** Teammate B
**Branch:** `stream-b-frontend`

```bash
git checkout dev
git checkout -b stream-b-frontend
```

> Start with mock data. Import types from `lib/types.ts` once Stream A pushes it.
> Use `MOCK_SCAN_REPORT` constant for all UI development — no need to wait for real API.

**B1 — Foundation**
- `app/layout.tsx` — Poppins font, dark bg, CSS variables
- `app/globals.css` — full design system CSS vars
- `tailwind.config.ts` — extend with VibeCheck colors
- `components/layout/navbar.tsx`
- `components/layout/footer.tsx`

**B2 — Landing Page** (`app/page.tsx`)
- Full viewport dark hero
- Headline: "Your vibe-coded app has vulnerabilities."
- Subtitle: "We found them."
- `components/scan-input.tsx` — GitHub URL input + Scan Now button
- 3 stat cards below fold

**B3 — Scan Progress Page** (`app/scan/[scanId]/loading.tsx`)
- Animated progress steps (Fetching → Classifying → Deep Scan → Building Report)
- Polls `GET /api/scan/[scanId]` every 2 seconds
- Shows which phase is currently running

**B4 — Results Page** (`app/scan/[scanId]/page.tsx`)
- `components/report/report-header.tsx` — score, repo name, scan time
- `components/report/vulnerability-list.tsx` — full findings list
- `components/report/vulnerability-card.tsx` — expandable finding card
- `components/report/file-tree.tsx` — files with color risk indicators
- Severity badge components (CRITICAL/HIGH/MEDIUM/LOW/CLEAN)

**B5 — Auto-Fix UI** (`components/report/fix-suggestion.tsx`)
- Diff viewer: before / after code
- "Apply Fix" button → calls `POST /api/fix/push`
- "View PR" link after push
- Loading state while fix is generating

**B6 — Polish**
- Error states (invalid URL, private repo, scan failed)
- Empty states
- Mobile responsive layout
- Skeleton loading cards

---

## Shared Contracts (Agree Before Splitting)

Stream B mocks these. Stream A implements them. Merge = they connect.

### Mock scan report for Stream B:
```typescript
// lib/mock-data.ts
export const MOCK_SCAN_REPORT: ScanReport = {
  scanId: 'mock-123',
  repoUrl: 'https://github.com/demo/my-startup',
  repoName: 'my-startup',
  scannedAt: new Date().toISOString(),
  durationMs: 51200,
  securityScore: 28,
  filesScanned: 47,
  vulnerabilities: [
    {
      id: 'v1',
      filePath: 'app/api/auth/route.ts',
      lineNumber: 23,
      severity: 'CRITICAL',
      category: 'HARDCODED_SECRET',
      title: 'Hardcoded JWT secret in source code',
      description: 'JWT secret is committed directly to the repo. Anyone with access can forge session tokens.',
      codeSnippet: "const SECRET = 'mysecretkey123'",
      fixSuggestion: "const SECRET = process.env.JWT_SECRET",
      detectedBy: 'both',
    },
    // add 2-3 more mock vulns for realistic UI dev
  ],
  summary: { critical: 3, high: 5, medium: 4, low: 2 },
  contextRisk: {
    isPublicFacing: true,
    hasAuth: true,
    hasPayments: true,
    dataClassification: 'SENSITIVE',
  },
}
```

### API contracts to agree on:
```
POST /api/scan
  body:  { repoUrl: string }
  res:   { scanId: string, status: 'queued' }

GET /api/scan/[scanId]
  res:   ScanReport | { status: 'scanning', phase: string, progress: number }

POST /api/fix
  body:  { vulnerabilityId: string, filePath: string, codeSnippet: string }
  res:   { original: string, fixed: string, explanation: string }

POST /api/fix/push
  body:  { repoUrl: string, filePath: string, fixedCode: string, vulnerabilityId: string }
  res:   { prUrl: string }
```

---

## Sync Points

| When | What |
|---|---|
| After A1+A2 | Stream A pushes `lib/types.ts` → Stream B imports it |
| After A6 | Stream A pushes API routes → Stream B swaps mock for real calls |
| End of day | Both PR into `dev`, resolve conflicts together |
| Final 2h | Both on `dev` together — integration, fix bugs, prep demo |

```bash
# Stay in sync with dev throughout
git fetch origin dev
git rebase origin/dev

# Push your stream branch
git push origin stream-a-backend   # or stream-b-frontend

# When your stream is done, open PR into dev
gh pr create --base dev --title "Stream A: Backend + AI Pipeline"
```

---

## Conflict Zones to Watch

These files will be touched by both streams — coordinate:

| File | Risk | How to handle |
|---|---|---|
| `lib/types.ts` | HIGH | Stream A owns it, Stream B reads only |
| `package.json` | MEDIUM | Communicate before adding deps |
| `tailwind.config.ts` | LOW | Stream B owns it |
| `app/layout.tsx` | LOW | Stream B owns it |

---

## Demo Checklist (Final 2 Hours)

```
[ ] Scan a real repo end to end (use a deliberately vulnerable test repo)
[ ] Auto-fix generates correct patch for at least 1 CRITICAL finding
[ ] GitHub PR push works
[ ] Security score displays correctly
[ ] All IBM services show green on /api/health
[ ] App deployed to Vercel
[ ] CLAUDE.md is in the repo root
[ ] README explains the IBM tech stack used
```
