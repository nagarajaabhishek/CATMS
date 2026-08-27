#!/bin/bash
# scripts/branch-audit.sh — Report-only audit of local branches ahead of the
# integration branch, across every repo this project tracks. Never merges or
# deletes anything — read the output, act manually (or via a PR).
#
# Repo list comes from .catms.json's "repos" field (populated at `catms init`
# for a multi-repo workspace, or left empty for a single repo). Falls back to
# auditing the current directory alone if that field is missing or empty.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
CATMS_JSON="${PROJECT_ROOT}/.catms.json"
INTEGRATION_BRANCH="{INTEGRATION_BRANCH}"

if [ -f "${CATMS_JSON}" ] && command -v node >/dev/null 2>&1; then
  REPOS_JSON=$(node -e "try{const c=require('${CATMS_JSON}');console.log(JSON.stringify(c.repos||[]))}catch(e){console.log('[]')}")
else
  REPOS_JSON="[]"
fi

if [ "${REPOS_JSON}" = "[]" ]; then
  REPOS=(".")
else
  # shellcheck disable=SC2207
  REPOS=($(node -e "JSON.parse(process.argv[1]).forEach(r=>console.log(r))" "${REPOS_JSON}"))
fi

echo "============================================="
echo " {PROJECT_NAME} — Branch Audit Report"
echo " Date: $(date)"
echo " Integration branch: $INTEGRATION_BRANCH"
echo "============================================="

for repo in "${REPOS[@]}"; do
  repo_path="${PROJECT_ROOT}/${repo}"
  if [ ! -d "${repo_path}/.git" ]; then
    echo ""
    echo "Repository '${repo}' has no .git directory, skipping."
    continue
  fi

  echo ""
  echo "---------------------------------------------"
  echo " Repository: ${repo}"
  echo "---------------------------------------------"

  git -C "$repo_path" fetch origin -q 2>/dev/null || true

  branches=$(git -C "$repo_path" branch | sed 's/^[ *]*//')

  found_unmerged=0
  for branch in $branches; do
    if [ "$branch" == "$INTEGRATION_BRANCH" ] || [ "$branch" == "main" ] || [ "$branch" == "master" ]; then
      continue
    fi

    ahead_count=$(git -C "$repo_path" rev-list --count "origin/$INTEGRATION_BRANCH".."$branch" 2>/dev/null || echo "")
    if [ -z "$ahead_count" ]; then
      ahead_count=$(git -C "$repo_path" rev-list --count "$INTEGRATION_BRANCH".."$branch" 2>/dev/null || echo "0")
    fi

    if [ -n "$ahead_count" ] && [ "$ahead_count" -gt 0 ]; then
      echo "  ⚠️  Branch '${branch}' is ahead of $INTEGRATION_BRANCH by ${ahead_count} commit(s)."
      found_unmerged=1
      git -C "$repo_path" log -n 1 --format="    Last commit: %h - %s (%an, %cr)" "$branch"
    fi
  done

  if [ "$found_unmerged" -eq 0 ]; then
    echo "  ✅ All local branches are fully merged into $INTEGRATION_BRANCH."
  fi
done

echo ""
echo "Audit complete. This script never merges or deletes — review and act manually."
