# VibeCheck

**Your vibe-coded app has vulnerabilities. We found them.**

VibeCheck is an AI-powered security scanner built for the vibe-coding era. Paste a GitHub repo URL, get a full security report in under 60 seconds — plain-English findings, exact line numbers, severity scores, and one-click AI-generated fixes.

Built for solo founders, no-code builders, and startups shipping with Bolt, Lovable, Cursor, Replit, or v0 who skip security review entirely.

---

## The Problem

45% of AI-generated code contains security vulnerabilities (Veracode 2025). Vibe coders ship fast — hardcoded secrets, SQL injection, broken auth, and vulnerable dependencies land in production. VibeCheck is the pre-deploy security gate they never had.

---

## Features

### Scan Pipeline
- **GitHub repo scanning** — paste any public repo URL, VibeCheck fetches and scans all relevant files automatically
- **Smart file prioritization** — high-risk files (`.env`, auth handlers, API routes, DB queries) are scanned first
- **Claude Haiku AI engine** — each file gets a combined fast-pass classification and deep vulnerability analysis in a single call, 12 files in parallel
- **Featherless AI second opinion** — top HIGH-risk files are optionally enriched by `Qwen2.5-Coder-32B-Instruct` in the background for additional coverage
- **Context-aware severity escalation** — README analysis detects app type (public-facing, financial, healthcare, auth) and escalates severity scores accordingly
- **Real-time SSE streaming** — scan progress streams live to the browser as each file completes, no polling required

### Security Analysis
Detects 10 vulnerability categories:
- Hardcoded secrets and API keys
- SQL injection
- Cross-site scripting (XSS)
- Broken authentication
- Insecure dependencies
- Sensitive data exposure
- Security misconfiguration
- Insecure Direct Object References (IDOR)
- Server-Side Request Forgery (SSRF)
- Path traversal

Each finding includes:
- Severity rating (CRITICAL / HIGH / MEDIUM / LOW / INFO)
- Exact file path and line number
- Plain-English description of the vulnerability
- The vulnerable code snippet
- Actionable fix suggestion
- CVE reference where applicable

### Security Score
Every scan produces a 0–100 security score with a breakdown of critical / high / medium / low finding counts, a context risk profile (is this public-facing? does it handle payments? what data classification?), and a full file tree with per-file risk indicators.

### Auto-Fix Engine
- **Generate Fix** — Claude generates a minimal, surgical code patch for any vulnerability
- **Diff viewer** — before/after diff rendered inline so you can review exactly what changed
- **Bulk fix** — apply fixes across multiple findings at once
- **Push as PR** — one click opens a GitHub Pull Request with the patched code; you merge when ready

### Authentication
- GitHub OAuth via NextAuth — sign in with GitHub so VibeCheck can access your private repos and open PRs on your behalf

### Storage
- Scan status and findings stored in IBM Cloudant for real-time progress tracking
- Full scan reports stored as JSON in IBM Cloud Object Storage (`vibesafe-scan-reports`)

---

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16, React 19, TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui |
| Primary AI | Claude Haiku (`@anthropic-ai/sdk`) |
| Second Opinion AI | Featherless AI — Qwen2.5-Coder-32B-Instruct |
| Context Analysis | IBM Watson NLU |
| Scan Storage | IBM Cloudant |
| Report Storage | IBM Cloud Object Storage |
| Auth | NextAuth v5 (GitHub OAuth) |
| GitHub Integration | Octokit |
| Diff Rendering | react-diff-viewer-continued |
| Validation | Zod |
| Deployment | Vercel |

---

## Getting Started

### Prerequisites
- Node.js 20+
- A GitHub OAuth App (for auth + PR creation)
- Anthropic API key
- IBM Cloud account (Cloudant + COS)
- Featherless AI API key (optional — second-opinion enrichment)

### Install

```bash
git clone https://github.com/your-username/vibecheck
cd vibecheck
npm install
```

### Environment Variables

Copy `.env.example` to `.env.local` and fill in your keys:

```bash
cp .env.example .env.local
```

```env
# GitHub OAuth (NextAuth)
AUTH_GITHUB_ID=
AUTH_GITHUB_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000

# Anthropic (primary scanner)
ANTHROPIC_API_KEY=

# Featherless AI (second-opinion enrichment)
FEATHERLESS_API_KEY=

# IBM Cloud
WATSONX_API_KEY=
WATSONX_PROJECT_ID=
WATSONX_MODEL_ID=ibm/granite-34b-code-instruct
IBM_IAM_TOKEN_URL=https://iam.cloud.ibm.com/identity/token

# IBM Cloudant
CLOUDANT_URL=
CLOUDANT_API_KEY=

# IBM Cloud Object Storage
IBM_COS_ENDPOINT=
IBM_COS_API_KEY=
IBM_COS_BUCKET=vibesafe-scan-reports
IBM_COS_INSTANCE_CRN=
```

### Run

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## How It Works

```
User enters GitHub URL
        ↓
POST /api/scan
        ↓
1. GitHub Fetcher
   Fetch repo file tree, filter to scannable files, download contents
        ↓
2. File Prioritizer
   Score files by risk surface — .env, auth, DB queries, API routes first
        ↓
3. Claude Haiku Scan (12 files in parallel)
   One call per file: classify risk level + extract all vulnerabilities
   Streams progress to browser via SSE as each file completes
        ↓
4. Context Layer (synchronous, instant)
   Keyword scan of README → detect app type → escalate severities
        ↓
5. Report Builder
   Merge all findings → calculate security score → assemble ScanReport
        ↓
6. Storage
   ScanReport → IBM COS  |  Scan summary → IBM Cloudant
        ↓
7. Featherless Enrichment (background, non-blocking)
   Top 5 HIGH-risk files → Qwen2.5-Coder-32B → append extra findings
        ↓
GET /api/scan/[scanId] → render full results UI
```

---

## Project Structure

```
vibecheck/
├── app/
│   ├── page.tsx                    # Landing page (hero + scan input)
│   ├── scan/[scanId]/
│   │   ├── page.tsx                # Results page
│   │   └── loading.tsx             # Animated scan progress (SSE)
│   └── api/
│       ├── scan/route.ts           # POST /api/scan
│       ├── scan/[scanId]/route.ts  # GET /api/scan/:id (SSE stream)
│       ├── fix/route.ts            # POST /api/fix — generate patch
│       ├── fix/push/route.ts       # POST /api/fix/push — open GitHub PR
│       ├── repos/route.ts          # GET /api/repos — user's GitHub repos
│       └── health/route.ts         # GET /api/health
│
├── lib/
│   ├── types.ts                    # All TypeScript interfaces
│   ├── claude.ts                   # Anthropic Haiku scan client
│   ├── featherless.ts              # Featherless AI client (OpenAI-compatible)
│   ├── github.ts                   # GitHub API — fetch files + open PRs
│   ├── auth.ts                     # NextAuth config
│   ├── ibm/
│   │   ├── cloudant.ts             # Scan status + findings storage
│   │   └── cos.ts                  # Full report JSON storage
│   └── scanner/
│       ├── index.ts                # Pipeline orchestrator
│       ├── fast-pass.ts            # Claude Haiku parallel scanner
│       ├── file-prioritizer.ts     # Risk-surface file scoring
│       ├── context-layer.ts        # README keyword analysis
│       ├── report-builder.ts       # ScanReport assembly + scoring
│       └── auto-fix.ts             # Patch generator + PR creator
│
└── components/
    ├── scan-input.tsx              # GitHub URL input
    ├── report/
    │   ├── report-header.tsx       # Score, repo info, metadata
    │   ├── file-tree.tsx           # Files with risk color indicators
    │   ├── vulnerability-card.tsx  # Expandable finding card + fix panel
    │   ├── results-client.tsx      # Results page client shell
    │   ├── fix-panel.tsx           # Diff viewer + Apply Fix + Push PR
    │   └── bulk-fix-button.tsx     # Apply fixes across multiple findings
    └── layout/
        ├── navbar.tsx
        └── footer.tsx
```

---

## Design System

Dark monochrome only. No gradients, no glow effects, no colored backgrounds except semantic severity.

| Token | Value | Use |
|---|---|---|
| `--color-bg-primary` | `#000000` | Main background |
| `--color-bg-secondary` | `#0a0a0a` | Card backgrounds |
| `--color-critical` | `#ff3b30` | CRITICAL severity |
| `--color-high` | `#ff6b35` | HIGH severity |
| `--color-medium` | `#f5a623` | MEDIUM severity |
| `--color-low` | `#4a9eff` | LOW severity |
| `--color-clean` | `#30d158` | Clean / passing |

Typography: Poppins (UI), JetBrains Mono (code snippets).

---

## Hackathon Tracks

- Best Cybersecurity & Trust
- Best Startup Potential
- Best Use of IBM Tech
- Best Use of Featherless AI

---

## License

MIT
