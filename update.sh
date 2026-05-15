#!/bin/bash
# CATMS — update.sh
# Pulls latest CATMS templates into a project that already uses CATMS.
#
# Usage (run from inside your project directory):
#   curl -fsSL https://raw.githubusercontent.com/nagarajaabhishek/CATMS/main/update.sh | bash
#
# OR if you cloned CATMS locally:
#   /path/to/CATMS/update.sh

set -e

CATMS_REPO="https://github.com/nagarajaabhishek/CATMS"
CATMS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(pwd)"

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║           CATMS — Update Templates                   ║"
echo "╚══════════════════════════════════════════════════════╝"
echo ""

# ── Check .catms.json exists ──────────────────────────────────────────────────

if [ ! -f "$PROJECT_DIR/.catms.json" ]; then
    echo "❌ No .catms.json found in $(pwd)"
    echo "   Is this a CATMS project? Run setup.sh first."
    exit 1
fi

# Read config
PROJECT_NAME=$(python3 -c "import json; d=json.load(open('.catms.json')); print(d['project'])")
CURRENT_VERSION=$(python3 -c "import json; d=json.load(open('.catms.json')); print(d['version'])")
LINEAR_TEAM_NAME=$(python3 -c "import json; d=json.load(open('.catms.json')); print(d['linear_team_name'])")
LINEAR_TEAM_ID=$(python3 -c "import json; d=json.load(open('.catms.json')); print(d['linear_team_id'])")
OBSIDIAN_VAULT_PATH=$(python3 -c "import json; d=json.load(open('.catms.json')); print(d['obsidian_vault_path'])")
GITHUB_USER=$(python3 -c "import json; d=json.load(open('.catms.json')); print(d['github_user'])")

echo "Project:         $PROJECT_NAME"
echo "Current version: $CURRENT_VERSION"
echo "CATMS source:    $CATMS_DIR"
echo ""

# ── Get latest CATMS version ──────────────────────────────────────────────────

LATEST_VERSION=$(cat "$CATMS_DIR/CHANGELOG.md" | grep "^## \[v" | head -1 | sed 's/## \[\(v[^]]*\)\].*/\1/')
echo "Latest version:  $LATEST_VERSION"

if [ "$CURRENT_VERSION" = "$LATEST_VERSION" ]; then
    echo ""
    echo "✅ Already up to date ($CURRENT_VERSION)"
    exit 0
fi

echo ""
echo "Update available: $CURRENT_VERSION → $LATEST_VERSION"
echo ""

# Show what changed
echo "── What changed ─────────────────────────────────────────"
awk "/^## \[$LATEST_VERSION\]/,/^## \[$CURRENT_VERSION\]/" "$CATMS_DIR/CHANGELOG.md" | \
    grep -v "^## \[$CURRENT_VERSION\]" | head -30
echo "─────────────────────────────────────────────────────────"
echo ""

read -p "Apply update? [y/N]: " CONFIRM
[[ "$CONFIRM" != "y" && "$CONFIRM" != "Y" ]] && echo "Cancelled." && exit 0

# ── Helper: replace placeholders ──────────────────────────────────────────────

apply_placeholders() {
    local file="$1"
    sed -i.bak \
        -e "s|{PROJECT_NAME}|$PROJECT_NAME|g" \
        -e "s|{GITHUB_USER}|$GITHUB_USER|g" \
        -e "s|{LINEAR_TEAM_NAME}|$LINEAR_TEAM_NAME|g" \
        -e "s|{LINEAR_TEAM_ID}|$LINEAR_TEAM_ID|g" \
        -e "s|{OBSIDIAN_VAULT_PATH}|$OBSIDIAN_VAULT_PATH|g" \
        "$file"
    rm -f "$file.bak"
}

echo ""
echo "Applying updates..."

# ── Safe to overwrite entirely (no project customisation) ─────────────────────

SAFE_FILES=(
    ".cursor/rules/workflow.mdc"
    ".cursor/rules/git-workflow.mdc"
    "docs/GIT_WORKFLOW.md"
)

for rel_path in "${SAFE_FILES[@]}"; do
    src="$CATMS_DIR/templates/$rel_path"
    dst="$PROJECT_DIR/$rel_path"
    if [ -f "$src" ]; then
        mkdir -p "$(dirname "$dst")"
        cp "$src" "$dst"
        apply_placeholders "$dst"
        echo "  ✓ Updated $rel_path"
    fi
done

# ── OpenSpec templates — always overwrite ─────────────────────────────────────

if [ -d "$PROJECT_DIR/docs/design/openspec-templates" ]; then
    cp "$CATMS_DIR/openspec-templates/"*.md "$PROJECT_DIR/docs/design/openspec-templates/"
    echo "  ✓ Updated openspec-templates/"
fi

# ── New files from this version (added, not replacing) ────────────────────────

# linear-milestones.md (new in v0.2.0)
if [ ! -f "$PROJECT_DIR/docs/linear-milestones.md" ] && [ -f "$CATMS_DIR/linear-milestones.md" ]; then
    cp "$CATMS_DIR/linear-milestones.md" "$PROJECT_DIR/docs/linear-milestones.md"
    apply_placeholders "$PROJECT_DIR/docs/linear-milestones.md"
    echo "  ✓ Added docs/linear-milestones.md (new in $LATEST_VERSION)"
fi

# ── Merge CLAUDE.md — add new sections, preserve existing ────────────────────

echo ""
echo "  ℹ  CLAUDE.md and CURSOR.md contain project-specific content."
echo "     Review the diff and merge manually if needed:"
echo "     diff $PROJECT_DIR/CLAUDE.md $CATMS_DIR/templates/CLAUDE.md"
echo ""

# ── Update .catms.json version ────────────────────────────────────────────────

python3 - <<PYEOF
import json
with open('.catms.json') as f:
    d = json.load(f)
d['version'] = '$LATEST_VERSION'
with open('.catms.json', 'w') as f:
    json.dump(d, f, indent=2)
    f.write('\n')
PYEOF
echo "  ✓ .catms.json updated to $LATEST_VERSION"

# ── Done ──────────────────────────────────────────────────────────────────────

echo ""
echo "╔══════════════════════════════════════════════════════╗"
echo "║  Updated $PROJECT_NAME to CATMS $LATEST_VERSION"
echo "╚══════════════════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Review CLAUDE.md and CURSOR.md manually for new sections"
echo "  2. Commit the updated files:"
echo "     git add .cursor/rules/ docs/ .catms.json"
echo "     git commit -m 'chore: update CATMS templates to $LATEST_VERSION'"
echo ""
echo "Full changelog: $CATMS_DIR/CHANGELOG.md"
echo ""
