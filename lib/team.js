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

  console.log('[3/3] Checking team-onboarding skill ...');
  const skillDest = path.join(PROJECT_DIR, '.claude/skills/team-onboarding/SKILL.md');
  const skillAction = copyIfMissing('templates/claude-skills/team-onboarding/SKILL.md', skillDest, values);
  console.log(skillAction === 'created' ? '    ✓ team-onboarding skill added to .claude/skills/' : '    ✓ team-onboarding skill present');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  ${developerName} added to ${config.project}`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Next steps:');
  console.log('');
  console.log('  1. You: commit and push .catms.json and the updated AGENTS.md / CLAUDE.md / CURSOR.md.');
  console.log('');
  console.log(`  2. A repo admin: give @${githubUser} access to the repo${config.repos && config.repos.length > 0 ? 's in this workspace' : ''}.`);
  console.log('     That is the only access CAMS needs — shared memory lives in the repo itself.');
  console.log('     (Secrets manager / deploy access, if their role needs it, is granted separately.)');
  console.log('');
  console.log(`  3. ${developerName}: clone and set up the machine — one command does the rest`);
  console.log('     (embedding key, dependencies, git hooks, MCP registration, memory built from git):');
  console.log(`     → git clone <repo-url> && cd ${config.project}`);
  console.log('     → catms setup');
  console.log(`     Claim tag: ${claimTag} — used as owner: in tasks.md and as the author on CAMS facts.`);
  console.log('');
}

module.exports = { add };
