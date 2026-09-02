'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { ask, confirm } = require('./prompt');
const { renderTeamRoster, substitute } = require('./placeholders');
const mergeBlock = require('./merge-block');

const CATMS_DIR = path.join(__dirname, '..');
const VERSION = require('../package.json').version;

function readTemplate(relPath) {
  return fs.readFileSync(path.join(CATMS_DIR, relPath), 'utf8');
}

function copyPlain(relSrc, destPath, values) {
  const content = substitute(readTemplate(relSrc), values);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.writeFileSync(destPath, content);
}

function copyIfMissing(relSrc, destPath, values) {
  if (fs.existsSync(destPath)) return 'skipped-exists';
  copyPlain(relSrc, destPath, values);
  return 'created';
}

async function add() {
  const PROJECT_DIR = process.cwd();
  const configPath = path.join(PROJECT_DIR, '.catms.json');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║      CATMS — Add Developer to Team                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  if (!fs.existsSync(configPath)) {
    console.log(`❌ No .catms.json found in ${PROJECT_DIR}`);
    console.log('   Is this a CATMS project? Run `catms init` first.');
    process.exitCode = 1;
    return;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

  console.log(`Project: ${config.project}`);
  console.log('');

  const developerName = await ask('New developer name');
  const githubUser = await ask('GitHub username');

  let claimTag = `@claude-${developerName.toLowerCase().split(/[^a-z0-9]+/)[0]}`;
  console.log('');
  console.log(`Default claim tag: ${claimTag}`);
  const useCustomTag = await confirm('Use a different claim tag?', { defaultYes: false });
  if (useCustomTag) {
    claimTag = await ask('Custom claim tag');
  }

  console.log('');
  console.log('── Summary ──────────────────────────────────────────────');
  console.log(`  Developer:  ${developerName}`);
  console.log(`  GitHub:     ${githubUser}`);
  console.log(`  Claim tag:  ${claimTag}`);
  console.log('─────────────────────────────────────────────────────────');

  const proceed = await confirm('Proceed?');
  if (!proceed) {
    console.log('Aborted.');
    return;
  }

  console.log('');
  console.log('[1/3] Updating .catms.json ...');

  // Ensure team array exists
  if (!config.team) {
    config.team = [];
  }

  // Add new team member
  config.team.push({
    name: developerName,
    github_user: githubUser,
    claim_tag: claimTag,
  });

  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log('    ✓ Team member added to .catms.json');

  console.log('[2/3] Updating managed blocks in AGENTS.md, CLAUDE.md, CURSOR.md ...');

  const values = {
    PROJECT_NAME: config.project,
    GITHUB_USER: config.github_user,
    SETUP_DATE: config.setup_date,
    INTEGRATION_BRANCH: config.integration_branch,
    TEAM_ROSTER: renderTeamRoster(config.team),
  };

  // Update each managed file
  for (const [rel, name] of [
    ['templates/AGENTS.md', 'AGENTS.md'],
    ['templates/CLAUDE.md', 'CLAUDE.md'],
    ['templates/CURSOR.md', 'CURSOR.md'],
  ]) {
    const templateContent = readTemplate(rel);
    const content = substitute(templateContent, values);
    const destPath = path.join(PROJECT_DIR, name);

    if (fs.existsSync(destPath)) {
      const action = mergeBlock.update(destPath, content, VERSION);
      if (action === 'updated') {
        console.log(`    ✓ ${name}: roster section updated`);
      } else if (action === 'manual-review-needed') {
        console.log(`    ⚠  ${name}: manual merge needed (no CATMS markers found)`);
      }
    }
  }

  console.log('[3/3] Setting up team-onboarding skill and git hooks ...');

  // Copy team-onboarding skill if not already present
  const skillDest = path.join(PROJECT_DIR, '.claude/skills/team-onboarding/SKILL.md');
  const skillAction = copyIfMissing('templates/claude-skills/team-onboarding/SKILL.md', skillDest, values);
  if (skillAction === 'created') {
    console.log('    ✓ team-onboarding skill added to .claude/skills/');
  }

  // Copy git hooks if .git exists
  if (fs.existsSync(path.join(PROJECT_DIR, '.git'))) {
    const hookDest = path.join(PROJECT_DIR, '.git/hooks/post-merge');
    if (!fs.existsSync(hookDest)) {
      const hookContent = readTemplate('templates/cams/hooks/post-merge');
      fs.mkdirSync(path.dirname(hookDest), { recursive: true });
      fs.writeFileSync(hookDest, hookContent);
      fs.chmodSync(hookDest, 0o755);
      console.log('    ✓ post-merge git hook installed');
    } else {
      console.log('    ⚠  post-merge hook already exists (skipped)');
    }
  } else {
    console.log('    ℹ  .git not found — git hooks will be set up after initial clone');
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  ${developerName} added to ${config.project}`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Next steps for the new developer:');
  console.log('');
  console.log('  1. Grant repository & service access:');
  console.log('     → GitHub repos (read + write access for this workspace)');
  console.log('     → Secrets manager / Doppler (same project, appropriate role)');
  console.log('     → Deploy targets (Vercel, Cloud Run, etc.)');
  console.log('     This is a manual, one-time human action — not something Claude can do.');
  console.log('');
  console.log('  2. Clone the coordination repository locally:');
  console.log(`     → git clone <repo-url> && cd ${config.project}`);
  if (config.repos && config.repos.length > 0) {
    console.log('     → For a multi-repo workspace, clone this repo, which holds the shared');
    console.log('       coordination files (tasks.md, sprint.md, decision.md, docs/, tools/cams/)');
  }
  console.log('');
  console.log('  3. Install Ollama and pull the embedding model (if using local embeddings):');
  console.log('     → https://ollama.ai/download');
  console.log('     → ollama pull mxbai-embed-large');
  console.log('');
  console.log('  4. Install CAMS dependencies and run backfill:');
  console.log('     → cd tools/cams && npm install');
  console.log('     → npm run backfill');
  console.log('');
  console.log('  5. Install the post-merge git hook (NOT cloned automatically):');
  console.log('     → cp tools/cams/hooks/post-merge .git/hooks/');
  console.log('     → chmod +x .git/hooks/post-merge');
  console.log('     → This hook runs CAMS backfill whenever pulling new changes.');
  console.log('');
  console.log('  6. [Optional] Set up continuous pull for near-live freshness:');
  console.log('     → Run: while true; do git pull --quiet; sleep 300; done');
  console.log('     → Or use the watch-sync.sh script: ./tools/cams/watch-sync.sh');
  console.log('');
  console.log('  7. Verify your claim tag in .catms.json:');
  console.log(`     → Your tag is: ${claimTag}`);
  console.log(`     → Use this on every task you claim: owner: ${claimTag}`);
  console.log('');
  console.log('  8. Read the branch discipline and workflow rules:');
  console.log('     → docs/BRANCHING.md (single-stage or two-stage, depends on project)');
  console.log('     → Start your first task using the team-onboarding skill in Claude Code');
  console.log('');
}

module.exports = { add };
