# VibeCheck — Claude Code Project Bible

> AI-powered security scanner for vibe-coded apps. Analyzes GitHub repositories for vulnerabilities,
> secrets, and insecure patterns introduced by AI-generated code — and explains every issue in plain English.

---

## Initial Prompts for Claude Code
You are initializing VibeCheck — a Next.js 14 security scanner for vibe-coded apps.

Read CLAUDE.md in full before doing anything.

Then complete these tasks in exact order:
1. Initialize Next.js 14 with TypeScript, Tailwind CSS, and shadcn/ui
2. Install all dependencies listed in CLAUDE.md under Key Dependencies
3. Create lib/types.ts with every interface defined in CLAUDE.md — this is the shared contract between both developers
4. Create lib/mock-data.ts with a MOCK_SCAN_REPORT constant populated with realistic fake data matching the ScanReport interface
5. Create .gitignore, .env.example from the env reference in CLAUDE.md
6. Create app/globals.css with the full CSS variable design system from CLAUDE.md
7. Create tailwind.config.ts extended with all VibeCheck colors from CLAUDE.md
8. Create app/layout.tsx with Poppins font loaded from Google Fonts and dark background
9. Run the dev server and confirm it starts clean

Do not build any features yet. Phase 0 is foundation only.
When done, output a summary of every file created and confirm the dev server runs.

```

---

## Project Overview

**Name:** VibeCheck
**Tagline:** "Your vibe-coded app has vulnerabilities. We found them."
**Target users:** Solo founders, no-code builders, and startups using Bolt, Lovable, Cursor,
Replit, or v0 to generate production code
**Core value prop:** Scan any GitHub repo in 60 seconds and get a plain-English security report
with severity scores, file locations, and fix suggestions — powered by IBM Granite + Featherless

### Problem
45% of AI-generated code contains security vulnerabilities (Veracode 2025). Vibe coders ship
fast and skip security review entirely — hardcoded secrets, SQL injection, broken auth, and
vulnerable dependencies land in production. VibeCheck is the pre-deploy security gate they
never had.

### Hackathon Tracks
- Best Cybersecurity & Trust
- Best Startup Potential
- Best Use of IBM Tech
- Best Use of Featherless AI

---

## Architecture

### Scan Pipeline
```
User enters GitHub URL
        ↓
POST /api/scan
        ↓
Phase 1 — GitHub Fetcher
  • Fetch repo file tree via GitHub API
  • Filter to scannable files (.js .ts .py .env* .json .yaml .toml)
  • Download file contents
        ↓
Phase 2 — Featherless AI (Fast Pass)
  • POST to featherless.ai/v1/chat/completions
  • Model: Qwen2.5-Coder-32B-Instruct
  • Classify every file: HIGH / MEDIUM / LOW / CLEAN
  • Returns: per-file risk scores + top vulnerability types
  • LOW + CLEAN files stop here — cost control
        ↓
Phase 3 — IBM watsonx.ai (Deep Scan)
  • HIGH + MEDIUM files only sent to Granite-34b-code-instruct
  • Deep analysis — exact line numbers, CVE types, severity
  • Returns: structured vulnerability list per file
        ↓
Phase 4 — Watson NLU (Context Layer)
  • Analyze README for app type detection
  • Detect: public-facing? financial data? auth? healthcare?
  • Escalates severity scores for sensitive-data apps
        ↓
Phase 5 — Report Assembly
  • Merge all results into unified ScanReport object
  • Calculate security score (0–100)
        ↓
Phase 6 — Storage
  • Full JSON report → IBM COS (vibesafe-scan-reports)
  • Scan summary → IBM Cloudant (vibesafe_scans)
        ↓
GET /api/scan/[scanId] → render ScanReport UI
```

### Auto-Fix Pipeline
```
User clicks "Apply Fix" on a vulnerability card
        ↓
POST /api/fix
  • Send: { vulnerabilityId, filePath, codeSnippet }
  • watsonx.ai (Granite) generates patched code
  • Returns: { original, fixed, explanation }
        ↓
Diff viewer shown in UI (before / after)
        ↓
User clicks "Push Fix"
        ↓
POST /api/fix/push
  • Fetch current file from GitHub
  • Replace vulnerable snippet with fixed snippet
  • Open GitHub PR with change
  • Returns: { prUrl }
        ↓
"View PR" link shown — user merges when ready
```

---

## File Structure

```
vibecheck/
├── CLAUDE.md                          ← this file
├── DEV_PIPELINE.md                    ← 2-person workstream guide
├── .env.local                         ← secrets (gitignored)
├── .env.example                       ← committed blank template
├── .gitignore
├── package.json
├── tailwind.config.ts
├── next.config.ts
│
├── .agent/
│   └── skills/                        ← Claude Code skills
│
├── app/
│   ├── layout.tsx                     ← root layout, Poppins font, dark bg
│   ├── page.tsx                       ← landing page (hero + scan input)
│   ├── globals.css                    ← CSS variables, Poppins import
│   │
│   ├── scan/
│   │   └── [scanId]/
│   │       ├── page.tsx               ← scan results page
│   │       └── loading.tsx            ← animated scan progress page
│   │
│   └── api/
│       ├── scan/
│       │   └── route.ts               ← POST /api/scan
│       ├── scan/[scanId]/
│       │   └── route.ts               ← GET /api/scan/:id
│       ├── fix/
│       │   └── route.ts               ← POST /api/fix — generate patch
│       ├── fix/push/
│       │   └── route.ts               ← POST /api/fix/push — open GitHub PR
│       └── health/
│           └── route.ts               ← GET /api/health
│
├── lib/
│   ├── types.ts                       ← ALL TypeScript interfaces (push first)
│   ├── mock-data.ts                   ← MOCK_SCAN_REPORT for Stream B dev
│   ├── ibm/
│   │   ├── iam.ts                     ← IAM token fetcher with caching
│   │   ├── watsonx.ts                 ← Granite client (scan + auto-fix)
│   │   ├── nlu.ts                     ← Watson NLU client
│   │   ├── cos.ts                     ← Cloud Object Storage client
│   │   └── cloudant.ts               ← Cloudant client
│   ├── featherless.ts                 ← Featherless AI client (OpenAI-compatible)
│   ├── github.ts                      ← GitHub API — fetch files + open PRs
│   └── scanner/
│       ├── index.ts                   ← scan orchestrator
│       ├── fast-pass.ts               ← Featherless classifier
│       ├── deep-scan.ts               ← watsonx.ai deep analysis
│       ├── context-layer.ts           ← NLU context enrichment
│       ├── report-builder.ts          ← assemble ScanReport
│       └── auto-fix.ts                ← generate + push code patches
│
└── components/
    ├── ui/                            ← shadcn/ui primitives
    ├── scan-input.tsx                 ← GitHub URL input + Scan Now button
    ├── scan-progress.tsx              ← animated phase progress (polls API)
    ├── report/
    │   ├── report-header.tsx          ← score, repo info, scan metadata
    │   ├── vulnerability-list.tsx     ← full findings list
    │   ├── vulnerability-card.tsx     ← expandable finding card
    │   ├── file-tree.tsx              ← files with risk color indicators
    │   └── fix-panel.tsx              ← diff viewer + Apply Fix + View PR
    └── layout/
        ├── navbar.tsx
        └── footer.tsx
```

### Git Branch Strategy
```
main                   ← production, deploy from here
dev                    ← integration branch, PRs merge here
stream-a-backend       ← Teammate A works here (lib/, api/)
stream-b-frontend      ← Teammate B works here (app/, components/)
```

---

## Core TypeScript Interfaces

```typescript
// lib/types.ts — Stream A pushes this FIRST

export type Severity = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'
export type VulnCategory =
  | 'HARDCODED_SECRET'
  | 'SQL_INJECTION'
  | 'XSS'
  | 'BROKEN_AUTH'
  | 'INSECURE_DEPENDENCY'
  | 'SENSITIVE_DATA_EXPOSURE'
  | 'SECURITY_MISCONFIGURATION'
  | 'IDOR'
  | 'SSRF'
  | 'PATH_TRAVERSAL'

export interface RepoFile {
  path: string
  content: string
  size: number
  language: string
}

export interface FastPassResult {
  filePath: string
  riskLevel: 'HIGH' | 'MEDIUM' | 'LOW' | 'CLEAN'
  detectedTypes: VulnCategory[]
  confidence: number
}

export interface Vulnerability {
  id: string
  filePath: string
  lineNumber?: number
  severity: Severity
  category: VulnCategory
  title: string
  description: string
  codeSnippet?: string
  fixSuggestion: string
  cveReference?: string
  detectedBy: 'featherless' | 'watsonx' | 'both'
}

export interface AutoFix {
  vulnerabilityId: string
  filePath: string
  original: string
  fixed: string
  explanation: string
  prUrl?: string
  status: 'pending' | 'generated' | 'pushed'
}

export interface ScanReport {
  scanId: string
  repoUrl: string
  repoName: string
  scannedAt: string
  durationMs: number
  securityScore: number          // 0–100, higher = more secure
  filesScanned: number
  vulnerabilities: Vulnerability[]
  summary: {
    critical: number
    high: number
    medium: number
    low: number
  }
  contextRisk: {
    isPublicFacing: boolean
    hasAuth: boolean
    hasPayments: boolean
    dataClassification: 'PUBLIC' | 'INTERNAL' | 'SENSITIVE' | 'CRITICAL'
  }
  reportUrl?: string
}

export interface ScanStatus {
  scanId: string
  status: 'scanning' | 'complete' | 'error'
  phase: 'fetching' | 'classifying' | 'deep-scan' | 'context' | 'building' | 'storing'
  progress: number               // 0–100
  error?: string
}

// API request/response types
export interface ScanRequest { repoUrl: string }
export interface ScanResponse { scanId: string; status: 'queued' }
export interface FixRequest { vulnerabilityId: string; filePath: string; codeSnippet: string }
export interface FixResponse { original: string; fixed: string; explanation: string }
export interface FixPushRequest { repoUrl: string; filePath: string; fixedCode: string; vulnerabilityId: string }
export interface FixPushResponse { prUrl: string }
```

---

## IBM Service Configuration

### watsonx.ai
- **Region:** ca-tor (Toronto)
- **Base URL:** `https://ca-tor.ml.cloud.ibm.com`
- **Model:** `ibm/granite-34b-code-instruct`
- **Auth:** IAM token (exchange API key for Bearer token at iam.cloud.ibm.com)
- **Endpoint:** `POST /ml/v1/text/generation?version=2023-05-29`

```typescript
// lib/ibm/watsonx.ts skeleton
const payload = {
  model_id: process.env.WATSONX_MODEL_ID,
  input: prompt,
  parameters: {
    decoding_method: 'greedy',
    max_new_tokens: 2000,
    repetition_penalty: 1.05,
  },
  project_id: process.env.WATSONX_PROJECT_ID,
}
```

### Watson NLU
- **Region:** us-east
- **Use:** `features: { entities: {}, keywords: {}, sentiment: {} }`
- **Purpose:** Analyze README text for app context (financial? healthcare? auth?)

### IBM Cloudant
- **Region:** au-syd
- **DB:** `vibesafe_scans`
- **Auth:** IAM apikey
- **Store:** ScanReport summary (no file contents, just metadata + findings)

### IBM Cloud Object Storage
- **Region:** ca-tor
- **Bucket:** `vibesafe-scan-reports`
- **Store:** Full ScanReport JSON as `{scanId}.json`
- **SDK:** `ibm-cos-sdk`

### Featherless AI
- **Base URL:** `https://api.featherless.ai/v1`
- **Model:** `Qwen/Qwen2.5-Coder-32B-Instruct`
- **Interface:** OpenAI-compatible (`/v1/chat/completions`)
- **Purpose:** Fast first-pass risk classification per file

---

## Scan & Fix Pipeline Prompts

### Featherless Fast-Pass Prompt
```
You are a security code scanner. Analyze the following code file and classify it.

File: {filePath}
Language: {language}
Content:
{fileContent}

Respond ONLY with valid JSON in this exact format, no other text:
{
  "riskLevel": "HIGH|MEDIUM|LOW|CLEAN",
  "detectedTypes": ["HARDCODED_SECRET", "SQL_INJECTION", ...],
  "confidence": 0.0-1.0,
  "topIssue": "one sentence summary or null"
}
```

### watsonx.ai Deep Scan Prompt
```
You are an expert security auditor. Perform a comprehensive vulnerability analysis on this code.

File: {filePath}
Content:
{fileContent}

Identify ALL security vulnerabilities. For each finding respond ONLY with valid JSON array:
[{
  "lineNumber": 42,
  "severity": "CRITICAL",
  "category": "HARDCODED_SECRET",
  "title": "AWS API key hardcoded in source",
  "description": "Two sentence plain-English description.",
  "fixSuggestion": "Actionable one-sentence fix.",
  "codeSnippet": "exact vulnerable line(s)",
  "cveReference": "CVE-XXXX-XXXX or null"
}]
```

### watsonx.ai Auto-Fix Prompt
```
You are a security engineer. Fix the following vulnerability in this code.

File: {filePath}
Vulnerability: {title}
Category: {category}
Severity: {severity}
Vulnerable code:
{codeSnippet}

Return ONLY valid JSON, no other text:
{
  "original": "the exact vulnerable code snippet",
  "fixed": "the corrected replacement code",
  "explanation": "one sentence explaining what changed and why it's now secure"
}

Rules:
- Only change the minimum code necessary to fix this specific vulnerability
- Preserve all existing logic, formatting, and surrounding code style
- Do not introduce new dependencies unless absolutely required
- The fixed code must be a drop-in replacement for the original snippet
```

---

## Design System

### Typography
```css
/* All fonts: Poppins from Google Fonts */
--font-title: 'Poppins', sans-serif;      /* weight: 700 (Bold) */
--font-subtitle: 'Poppins', sans-serif;   /* weight: 600 (SemiBold) */
--font-body: 'Poppins', sans-serif;       /* weight: 400 (Regular) */
--font-mono: 'JetBrains Mono', monospace; /* code snippets */
```

### Color Palette (Dark Monochrome)
```css
--color-bg-primary: #000000;       /* main background */
--color-bg-secondary: #0a0a0a;     /* card backgrounds */
--color-bg-tertiary: #111111;      /* elevated surfaces */
--color-bg-hover: #1a1a1a;         /* hover states */
--color-border: #222222;           /* default borders */
--color-border-subtle: #1a1a1a;    /* subtle dividers */
--color-text-primary: #ffffff;     /* primary text */
--color-text-secondary: #999999;   /* muted text */
--color-text-tertiary: #666666;    /* hints, placeholders */

/* Semantic — only these colors allowed */
--color-critical: #ff3b30;         /* CRITICAL severity */
--color-high: #ff6b35;             /* HIGH severity */
--color-medium: #f5a623;           /* MEDIUM severity */
--color-low: #4a9eff;              /* LOW severity */
--color-clean: #30d158;            /* clean / passing */
```

### Component Conventions
- All cards: `bg-[#0a0a0a] border border-[#222] rounded-lg`
- All inputs: `bg-[#111] border border-[#333] text-white placeholder-[#666]`
- Primary button: `bg-white text-black font-semibold hover:bg-[#e0e0e0]`
- Secondary button: `bg-transparent border border-[#333] text-white hover:bg-[#111]`
- Score badge CRITICAL: `bg-[#ff3b30]/10 text-[#ff3b30] border border-[#ff3b30]/20`
- No gradients. No glow effects. No colored backgrounds except semantic severity.
- Subtle animations: `transition-all duration-150` on interactive elements only

### Key UI Pages

**Landing Page (`/`)**
- Full-viewport dark hero
- Large Poppins Bold headline: "Your vibe-coded app has vulnerabilities."
- Subtitle: "We found them."
- Single GitHub URL input + "Scan Now" button
- Below fold: 3 stat cards (45% of AI code has vulns, 60s scan time, IBM-powered)

**Results Page (`/scan/[scanId]`)**
- Top: Security Score (big number 0–100, color-coded)
- Repo info + scan metadata
- Vulnerability summary bar (critical/high/medium/low counts)
- File tree with risk indicators on the left
- Vulnerability list with expandable cards on the right
- Each card: severity badge, file path, line number, description, fix suggestion
- Each card: "Apply Fix" button → opens fix panel below

**Fix Panel (inside vulnerability card)**
- Diff viewer: original code (left/top) vs fixed code (right/bottom)
- "Generate Fix" button → calls `POST /api/fix`, shows diff
- "Push as PR" button → calls `POST /api/fix/push`, shows PR link
- Loading state while watsonx.ai generates the patch

---

## Available Skills

Skills are located in `.agent/skills/`. Claude Code auto-discovers and loads them when relevant.
See `install-skills.sh` to install all skills.

### Workflow & Planning
| Skill | Path | Use When |
|---|---|---|
| obra/superpowers | `.agent/skills/superpowers/` | Starting any new feature — brainstorm → spec → plan → execute |
| obra/writing-plans | `.agent/skills/writing-plans/` | Breaking down a task into implementable steps |
| obra/test-driven-development | `.agent/skills/test-driven-development/` | Implementing any feature with tests first |
| obra/systematic-debugging | `.agent/skills/systematic-debugging/` | Encountering any bug or unexpected behavior |
| obra/finishing-a-development-branch | `.agent/skills/finishing-a-development-branch/` | Completing a branch before merge |

### Frontend & Design
| Skill | Path | Use When |
|---|---|---|
| anthropics/frontend-design | `.agent/skills/frontend-design/` | Building any UI component |
| vercel-labs/web-design-guidelines | `.agent/skills/web-design-guidelines/` | Auditing UI for accessibility + quality |
| vercel-labs/react-best-practices | `.agent/skills/react-best-practices/` | Writing React/Next.js components |

### Security (Critical for VibeCheck)
| Skill | Path | Use When |
|---|---|---|
| BehiSecc/vibesec | `.agent/skills/vibesec/` | Writing any scan logic or security feature |
| BehiSecc/owasp-security | `.agent/skills/owasp-security/` | Implementing vulnerability detection rules |
| BehiSecc/defense-in-depth | `.agent/skills/defense-in-depth/` | Adding any auth or API security layer |
| BehiSecc/varlock | `.agent/skills/varlock/` | Handling env vars and secrets in code |

### Deployment
| Skill | Path | Use When |
|---|---|---|
| vercel-labs/deploy | `.agent/skills/deploy/` | Deploying to Vercel |

---

## Implementation Phases

> See `DEV_PIPELINE.md` for the full 2-person workstream breakdown.
> Stream A and Stream B work in parallel after Phase 0.

### Phase 0 — Shared Setup (Both Together)
- [ ] Init Next.js 14 with TypeScript + Tailwind + shadcn/ui
- [ ] Install all dependencies (see Key Dependencies below)
- [ ] Create `lib/types.ts` with all shared interfaces — **Stream A pushes this first**
- [ ] Create `lib/mock-data.ts` with `MOCK_SCAN_REPORT` — **Stream B uses this immediately**
- [ ] Set up `.env.local` from `.env.example`
- [ ] Create git branches: `dev`, `stream-a-backend`, `stream-b-frontend`
- [ ] Run `install-skills.sh`

### Stream A — Phase 1: IBM & Featherless Clients
- [ ] `lib/ibm/iam.ts` — IAM token fetcher with caching
- [ ] `lib/ibm/watsonx.ts` — Granite client for scan + auto-fix
- [ ] `lib/ibm/nlu.ts` — Watson NLU client
- [ ] `lib/ibm/cos.ts` — COS report storage client
- [ ] `lib/ibm/cloudant.ts` — Cloudant summary client
- [ ] `lib/featherless.ts` — OpenAI-compatible Featherless client
- [ ] `lib/github.ts` — fetch repo files + open PRs
- [ ] `GET /api/health` — verify all service connections

### Stream A — Phase 2: Scan Pipeline
- [ ] `lib/scanner/fast-pass.ts` — Featherless classifier
- [ ] `lib/scanner/deep-scan.ts` — watsonx.ai deep analysis
- [ ] `lib/scanner/context-layer.ts` — NLU README enrichment
- [ ] `lib/scanner/report-builder.ts` — assemble ScanReport + score
- [ ] `lib/scanner/index.ts` — orchestrate all phases
- [ ] `POST /api/scan` — accept repoUrl, run pipeline, return scanId
- [ ] `GET /api/scan/[scanId]` — return report or scan status

### Stream A — Phase 3: Auto-Fix Engine
- [ ] `lib/scanner/auto-fix.ts` — watsonx.ai patch generator
- [ ] `POST /api/fix` — accept vuln, return diff
- [ ] `POST /api/fix/push` — open GitHub PR with fix

### Stream B — Phase 1: Foundation & Layout
- [ ] `app/globals.css` — full CSS variable design system
- [ ] `tailwind.config.ts` — extend with VibeCheck colors
- [ ] `app/layout.tsx` — Poppins font, dark bg, metadata
- [ ] `components/layout/navbar.tsx` + `footer.tsx`

### Stream B — Phase 2: Landing + Progress Pages
- [ ] `components/scan-input.tsx` — GitHub URL input + Scan Now
- [ ] `app/page.tsx` — full hero landing page with stat cards
- [ ] `app/scan/[scanId]/loading.tsx` — animated phase progress with polling

### Stream B — Phase 3: Results UI
- [ ] `components/report/report-header.tsx` — score, repo info
- [ ] `components/report/file-tree.tsx` — files with risk color indicators
- [ ] `components/report/vulnerability-card.tsx` — expandable finding card
- [ ] `components/report/vulnerability-list.tsx` — full findings list
- [ ] `app/scan/[scanId]/page.tsx` — assemble full results page

### Stream B — Phase 4: Auto-Fix UI
- [ ] `components/report/fix-panel.tsx` — diff viewer + Apply Fix + Push PR buttons
- [ ] Wire Generate Fix button → `POST /api/fix`
- [ ] Wire Push as PR button → `POST /api/fix/push`
- [ ] Show PR link after successful push

### Integration — Both Together
- [ ] Stream B swaps `MOCK_SCAN_REPORT` for real `GET /api/scan/[scanId]` call
- [ ] End-to-end test with a real vulnerable repo
- [ ] Error states + loading skeletons
- [ ] Deploy to Vercel

---

## Key Dependencies

```json
{
  "dependencies": {
    "next": "14.x",
    "react": "18.x",
    "typescript": "5.x",
    "tailwindcss": "3.x",
    "@ibm-cloud/watsonx-ai": "latest",
    "@ibm-cloud/cloudant": "latest",
    "ibm-cos-sdk": "latest",
    "ibm-watson": "latest",
    "openai": "latest",
    "octokit": "latest",
    "zod": "latest",
    "uuid": "latest",
    "diff": "latest",
    "react-diff-viewer-continued": "latest"
  }
}
```

> `diff` — generate unified diffs for the auto-fix patch
> `react-diff-viewer-continued` — render the before/after diff in the fix panel UI

---

## IBM IAM Token Helper

All IBM services require a Bearer token exchanged from the API key.
Implement a cached token getter in `lib/ibm/iam.ts`:

```typescript
// Cache token to avoid re-fetching on every request
let cachedToken: { token: string; expiresAt: number } | null = null

export async function getIBMToken(): Promise<string> {
  if (cachedToken && Date.now() < cachedToken.expiresAt - 60_000) {
    return cachedToken.token
  }
  const res = await fetch(process.env.IBM_IAM_TOKEN_URL!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=urn:ibm:params:oauth:grant-type:apikey&apikey=${process.env.WATSONX_API_KEY}`,
  })
  const data = await res.json()
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  }
  return cachedToken.token
}
```

---

## Rules for Claude Code

### Universal (both streams)
1. **Always read CLAUDE.md before starting any task**
2. **Always use the Poppins font** — never system fonts in UI components
3. **Always use CSS variables** from the design system — no hardcoded hex colors in components
4. **Use TypeScript strictly** — no `any` types, always import interfaces from `lib/types.ts`
5. **The app name is VibeCheck** — not VibeSafe, not VibeGuard, not VibeScan
6. **Use the `web-design-guidelines` skill** before finalizing any UI component
7. **Use obra/superpowers workflow** — brainstorm → spec → plan → execute → review

### Stream A (Backend)
8. **Push `lib/types.ts` first** — before any other file, so Stream B can import from it
9. **Never log secrets** — use `varlock` skill when touching env vars
10. **Use the `vibesec` skill** when writing any scan or security-related logic
11. **IBM API errors must be caught and surfaced** — never silently fail on IBM calls
12. **Featherless runs first** — always do the fast pass before calling watsonx.ai (cost control)
13. **Keep scan API route under 60s** — Vercel serverless function timeout limit
14. **Auto-fix must be minimal** — only patch the vulnerable snippet, never rewrite surrounding code

### Stream B (Frontend)
15. **Use `MOCK_SCAN_REPORT` from `lib/mock-data.ts`** until real API is available — never block on Stream A
16. **Import all types from `lib/types.ts`** — never redefine interfaces locally
17. **Fix panel is non-destructive** — user must explicitly click Push to open a PR, never auto-push
18. **Show diff before push** — always render before/after diff in fix-panel before showing Push button
