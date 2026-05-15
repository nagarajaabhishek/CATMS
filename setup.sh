#!/bin/bash
# CATMS — Coding Agents Team Management System
# Interactive setup script — run from inside CATMS repo
# Usage: ./setup.sh

set -e

CATMS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║     CATMS — Coding Agents Team Management System     ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Gather inputs ────────────────────────────────────────────────────────────

read -p "Project name (e.g. my-app): " PROJECT_NAME
read -p "GitHub username: " GITHUB_USER
read -p "Linear team name (e.g. My Team): " LINEAR_TEAM_NAME
read -p "Linear team ID (UUID from Linear API settings): " LINEAR_TEAM_ID
read -p "Obsidian vault path (e.g. ~/Documents/obsidian-vault): " OBSIDIAN_VAULT_PATH
read -p "Target project directory (where to copy templates, e.g. ~/projects/my-app): " TARGET_DIR
read -p "Server/droplet IP (leave blank if not applicable): " DROPLET_IP

# Expand tilde
OBSIDIAN_VAULT_PATH="${OBSIDIAN_VAULT_PATH/#\~/$HOME}"
TARGET_DIR="${TARGET_DIR/#\~/$HOME}"

echo ""
echo "── Summary ──────────────────────────────────────────────"
echo "  Project:       $PROJECT_NAME"
echo "  GitHub user:   $GITHUB_USER"
echo "  Linear team:   $LINEAR_TEAM_NAME ($LINEAR_TEAM_ID)"
echo "  Obsidian vault: $OBSIDIAN_VAULT_PATH"
echo "  Target dir:    $TARGET_DIR"
echo "  Droplet IP:    ${DROPLET_IP:-'(none)'}"
echo "─────────────────────────────────────────────────────────"
read -p "Proceed? [y/N]: " CONFIRM
[[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]] && echo "Aborted." && exit 0

# ── Helper: replace placeholders in a file ───────────────────────────────────

replace_placeholders() {
    local file="$1"
    sed -i.bak \
        -e "s|{PROJECT_NAME}|$PROJECT_NAME|g" \
        -e "s|{GITHUB_USER}|$GITHUB_USER|g" \
        -e "s|{LINEAR_TEAM_NAME}|$LINEAR_TEAM_NAME|g" \
        -e "s|{LINEAR_TEAM_ID}|$LINEAR_TEAM_ID|g" \
        -e "s|{OBSIDIAN_VAULT_PATH}|$OBSIDIAN_VAULT_PATH|g" \
        -e "s|{DROPLET_IP}|${DROPLET_IP:-YOUR_SERVER_IP}|g" \
        "$file"
    rm -f "$file.bak"
}

# ── Copy templates to target project ─────────────────────────────────────────

echo ""
echo "[1/4] Copying templates to $TARGET_DIR ..."
mkdir -p "$TARGET_DIR"

# Copy template files
cp "$CATMS_DIR/templates/CLAUDE.md" "$TARGET_DIR/CLAUDE.md"
cp "$CATMS_DIR/templates/CURSOR.md" "$TARGET_DIR/CURSOR.md"

mkdir -p "$TARGET_DIR/.cursor/rules"
cp "$CATMS_DIR/templates/.cursor/rules/workflow.mdc" "$TARGET_DIR/.cursor/rules/workflow.mdc"
cp "$CATMS_DIR/templates/.cursor/rules/git-workflow.mdc" "$TARGET_DIR/.cursor/rules/git-workflow.mdc"

mkdir -p "$TARGET_DIR/docs"
cp "$CATMS_DIR/templates/docs/GIT_WORKFLOW.md" "$TARGET_DIR/docs/GIT_WORKFLOW.md"

mkdir -p "$TARGET_DIR/docs/design/openspec-templates"
cp "$CATMS_DIR/openspec-templates/"*.md "$TARGET_DIR/docs/design/openspec-templates/"

# Replace placeholders
for f in \
    "$TARGET_DIR/CLAUDE.md" \
    "$TARGET_DIR/CURSOR.md" \
    "$TARGET_DIR/.cursor/rules/workflow.mdc" \
    "$TARGET_DIR/.cursor/rules/git-workflow.mdc" \
    "$TARGET_DIR/docs/GIT_WORKFLOW.md"; do
    replace_placeholders "$f"
done

echo "    ✓ Template files copied and customised"

# ── Set up Obsidian vault structure ──────────────────────────────────────────

echo "[2/4] Setting up Obsidian vault at $OBSIDIAN_VAULT_PATH ..."

VAULT_PROJECT="$OBSIDIAN_VAULT_PATH/projects/$PROJECT_NAME"
mkdir -p \
    "$OBSIDIAN_VAULT_PATH/context" \
    "$VAULT_PROJECT/context" \
    "$VAULT_PROJECT/sessions" \
    "$VAULT_PROJECT/design/changes" \
    "$VAULT_PROJECT/design/archive" \
    "$VAULT_PROJECT/design/decisions" \
    "$VAULT_PROJECT/testing/bugs"

# Copy Obsidian templates
if [ ! -f "$OBSIDIAN_VAULT_PATH/context/active-projects.md" ]; then
    cp "$CATMS_DIR/obsidian-template/context/active-projects.md" "$OBSIDIAN_VAULT_PATH/context/active-projects.md"
    replace_placeholders "$OBSIDIAN_VAULT_PATH/context/active-projects.md"
fi

for tmpl in overview.md context.md; do
    if [ ! -f "$VAULT_PROJECT/$tmpl" ]; then
        cp "$CATMS_DIR/obsidian-template/projects/{PROJECT_NAME}/$tmpl" "$VAULT_PROJECT/$tmpl"
        replace_placeholders "$VAULT_PROJECT/$tmpl"
    fi
done

for tmpl in infra.md decisions.md; do
    if [ ! -f "$VAULT_PROJECT/context/$tmpl" ]; then
        cp "$CATMS_DIR/obsidian-template/projects/{PROJECT_NAME}/context/$tmpl" "$VAULT_PROJECT/context/$tmpl"
        replace_placeholders "$VAULT_PROJECT/context/$tmpl"
    fi
done

touch "$VAULT_PROJECT/design/specs.md"
touch "$VAULT_PROJECT/sessions/.gitkeep"
touch "$VAULT_PROJECT/testing/bugs/.gitkeep"

echo "    ✓ Obsidian vault structure created"

# ── Update CLAUDE.md global file (optional) ───────────────────────────────────

echo "[3/4] Writing .catms.json to $TARGET_DIR ..."
CATMS_VERSION=$(cat "$CATMS_DIR/CHANGELOG.md" | grep "^## \[v" | head -1 | sed 's/## \[\(v[^]]*\)\].*/\1/')
cat > "$TARGET_DIR/.catms.json" << JSONEOF
{
  "version": "$CATMS_VERSION",
  "project": "$PROJECT_NAME",
  "github_user": "$GITHUB_USER",
  "linear_team_name": "$LINEAR_TEAM_NAME",
  "linear_team_id": "$LINEAR_TEAM_ID",
  "obsidian_vault_path": "$OBSIDIAN_VAULT_PATH",
  "catms_repo": "https://github.com/nagarajaabhishek/CATMS",
  "setup_date": "$(date +%Y-%m-%d)"
}
JSONEOF
echo "    ✓ .catms.json written ($CATMS_VERSION)"

echo "[3b/4] Checking ~/.claude/CLAUDE.md ..."
if [ -f "$HOME/.claude/CLAUDE.md" ]; then
    echo "    ⚠  ~/.claude/CLAUDE.md already exists — skipping (update manually if needed)"
else
    cp "$CATMS_DIR/templates/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
    replace_placeholders "$HOME/.claude/CLAUDE.md"
    echo "    ✓ ~/.claude/CLAUDE.md created"
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo "[4/4] Done!"
echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  CATMS setup complete for: $PROJECT_NAME"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo ""
echo "  1. Linear setup:"
echo "     → Follow linear-setup.md to create your team, states, and projects"
echo ""
echo "  2. Add MCP tools to Claude Code:"
echo "     → claude mcp add -s user linear-mcp (with LINEAR_API_KEY)"
echo "     → claude mcp add -s user obsidian-mcp (with OBSIDIAN_VAULT_PATH)"
echo ""
echo "  3. Open your project in Cursor:"
echo "     → .cursor/rules/*.mdc will auto-apply to every chat"
echo ""
echo "  4. Start your first session:"
echo "     → Read $OBSIDIAN_VAULT_PATH/context/active-projects.md"
echo "     → Create your first Linear issue with [P1][You] or [P1][Agent] prefix"
echo ""
echo "  Full docs: $CATMS_DIR/README.md"
echo ""
