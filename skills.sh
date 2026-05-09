#!/usr/bin/env bash
# ============================================================
#  VibeCheck — Claude Code Skills Installer
#  Installs all skills into .agent/skills/
#  Usage: chmod +x install-skills.sh && ./install-skills.sh
# ============================================================

set -e

SKILLS_DIR=".agent/skills"
BOLD="\033[1m"
GREEN="\033[0;32m"
YELLOW="\033[0;33m"
CYAN="\033[0;36m"
RED="\033[0;31m"
RESET="\033[0m"

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║     VibeCheck — Skills Installer         ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""

# Check npx is available
if ! command -v npx &> /dev/null; then
  echo -e "${RED}✗ npx not found. Install Node.js first.${RESET}"
  exit 1
fi

# Create skills directory
mkdir -p "$SKILLS_DIR"
echo -e "${CYAN}→ Skills directory: ${SKILLS_DIR}${RESET}"
echo ""

# ============================================================
# Helper function
# ============================================================
install_skill() {
  local label="$1"
  local source="$2"
  local skill_flag="$3"

  echo -e "${YELLOW}Installing:${RESET} ${BOLD}${label}${RESET}"

  if [ -n "$skill_flag" ]; then
    npx skills add "$source" --skill "$skill_flag" -a claude-code -y 2>/dev/null \
      && echo -e "  ${GREEN}✓ Done${RESET}" \
      || echo -e "  ${RED}✗ Failed — skipping (install manually if needed)${RESET}"
  else
    npx skills add "$source" -a claude-code -y 2>/dev/null \
      && echo -e "  ${GREEN}✓ Done${RESET}" \
      || echo -e "  ${RED}✗ Failed — skipping (install manually if needed)${RESET}"
  fi
}

# ============================================================
# SECTION 1 — Anthropic Official Skills
# ============================================================
echo -e "${BOLD}── Anthropic Official ──────────────────────${RESET}"

install_skill "frontend-design" "anthropics/skills" "frontend-design"
install_skill "docx" "anthropics/skills" "docx"
install_skill "pptx" "anthropics/skills" "pptx"

echo ""

# ============================================================
# SECTION 2 — Vercel Official Skills
# ============================================================
echo -e "${BOLD}── Vercel Official ─────────────────────────${RESET}"

install_skill "web-design-guidelines" "vercel-labs/agent-skills" "web-design-guidelines"
install_skill "react-best-practices" "vercel-labs/agent-skills" "react-best-practices"
install_skill "deploy" "vercel-labs/agent-skills" "deploy"

echo ""

# ============================================================
# SECTION 3 — obra/superpowers (Full Agentic Workflow)
# ============================================================
echo -e "${BOLD}── obra/superpowers (Workflow) ──────────────${RESET}"

install_skill "superpowers (full bundle)" "obra/superpowers"
install_skill "test-driven-development" "obra/superpowers" "test-driven-development"
install_skill "systematic-debugging" "obra/superpowers" "systematic-debugging"
install_skill "finishing-a-development-branch" "obra/superpowers" "finishing-a-development-branch"
install_skill "using-git-worktrees" "obra/superpowers" "using-git-worktrees"
install_skill "writing-plans" "obra/superpowers" "writing-plans"
install_skill "subagent-driven-development" "obra/superpowers" "subagent-driven-development"
install_skill "verification-before-completion" "obra/superpowers" "verification-before-completion"

echo ""

# ============================================================
# SECTION 4 — Security Skills (Critical for VibeCheck)
# ============================================================
echo -e "${BOLD}── Security Skills (Critical) ───────────────${RESET}"

install_skill "vibesec (secure code writing)" "BehiSecc/vibesec"
install_skill "owasp-security (OWASP Top 10)" "BehiSecc/awesome-claude-skills" "owasp-security"
install_skill "defense-in-depth" "BehiSecc/awesome-claude-skills" "defense-in-depth"
install_skill "varlock (secret env management)" "BehiSecc/awesome-claude-skills" "varlock-claude-skill"
install_skill "systematic-debugging (security)" "BehiSecc/awesome-claude-skills" "systematic-debugging"

echo ""

# ============================================================
# SECTION 5 — Next.js / TypeScript Skills
# ============================================================
echo -e "${BOLD}── Next.js / TypeScript ────────────────────${RESET}"

install_skill "nextjs-skills" "wsimmonds/claude-nextjs-skills"

echo ""

# ============================================================
# Verify installation
# ============================================================
echo -e "${BOLD}── Installed Skills ────────────────────────${RESET}"
echo ""

if [ -d "$HOME/.claude/skills" ]; then
  skill_count=$(find "$HOME/.claude/skills" -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
  echo -e "${GREEN}✓ ${skill_count} SKILL.md files found in ~/.claude/skills${RESET}"
fi

if [ -d ".claude/skills" ]; then
  local_count=$(find ".claude/skills" -name "SKILL.md" 2>/dev/null | wc -l | tr -d ' ')
  echo -e "${GREEN}✓ ${local_count} SKILL.md files found in .claude/skills${RESET}"
fi

echo ""
echo -e "${BOLD}╔══════════════════════════════════════════╗${RESET}"
echo -e "${BOLD}║   Skills installed! Start Claude Code:   ║${RESET}"
echo -e "${BOLD}║                                          ║${RESET}"
echo -e "${BOLD}║   claude                                 ║${RESET}"
echo -e "${BOLD}║                                          ║${RESET}"
echo -e "${BOLD}║   Then paste the initial prompt from     ║${RESET}"
echo -e "${BOLD}║   CLAUDE.md to get started.              ║${RESET}"
echo -e "${BOLD}╚══════════════════════════════════════════╝${RESET}"
echo ""