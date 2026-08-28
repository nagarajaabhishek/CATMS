'use strict';

const fs = require('fs');
const path = require('path');

const { confirm } = require('./prompt');
const { substitute, todayISODate } = require('./placeholders');
const mergeBlock = require('./merge-block');
const mergeJson = require('./merge-json');

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

async function run() {
  const PROJECT_DIR = process.cwd();
  const configPath = path.join(PROJECT_DIR, '.catms.json');

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║           CATMS — Update Templates                   ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  if (!fs.existsSync(configPath)) {
    console.log(`❌ No .catms.json found in ${PROJECT_DIR}`);
    console.log('   Is this a CATMS project? Run `catms init` first.');
    process.exitCode = 1;
    return;
  }

  const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const currentVersion = config.version;
  const latestVersion = `v${VERSION}`;

  console.log(`Project:         ${config.project}`);
  console.log(`Current version: ${currentVersion}`);
  console.log(`Latest version:  ${latestVersion}`);
  console.log('');

  if (currentVersion === latestVersion) {
    console.log(`✅ Already up to date (${currentVersion})`);
    return;
  }

  console.log(`Update available: ${currentVersion} → ${latestVersion}`);
  console.log('');

  const proceed = await confirm('Apply update?');
  if (!proceed) {
    console.log('Cancelled.');
    return;
  }

  // branch_strategy/integration_branch/repos didn't exist before v0.5.0 —
  // default a pre-v0.5.0 project to single-stage/main/[] rather than crash.
  const BRANCH_STRATEGY = config.branch_strategy || 'single-stage';
  const INTEGRATION_BRANCH = config.integration_branch || (BRANCH_STRATEGY === 'two-stage' ? 'dev' : 'main');

  const values = {
    PROJECT_NAME: config.project,
    GITHUB_USER: config.github_user,
    SETUP_DATE: config.setup_date || todayISODate(),
    INTEGRATION_BRANCH,
  };

  console.log('');
  console.log('Applying updates...');

  // 1. Full overwrite files — no project customization expected in any of these
  const branchingTemplate = BRANCH_STRATEGY === 'two-stage'
    ? 'templates/branching/two-stage.md'
    : 'templates/branching/single-stage.md';
  const safeFiles = [
    ['templates/.cursor/rules/workflow.mdc', '.cursor/rules/workflow.mdc'],
    ['templates/.cursor/rules/git-workflow.mdc', '.cursor/rules/git-workflow.mdc'],
    [branchingTemplate, 'docs/BRANCHING.md'],
    ['templates/docs/SPRINT-WORKFLOW.md', 'docs/SPRINT-WORKFLOW.md'],
    ['templates/scripts/branch-audit.sh', 'scripts/branch-audit.sh'],
    ['templates/claude-skills/task-kickoff/SKILL.md', '.claude/skills/task-kickoff/SKILL.md'],
    ['templates/claude-skills/sprint-planning/SKILL.md', '.claude/skills/sprint-planning/SKILL.md'],
    ['templates/claude-skills/pr-checks-loop/SKILL.md', '.claude/skills/pr-checks-loop/SKILL.md'],
    ['templates/claude-skills/sprint-close/SKILL.md', '.claude/skills/sprint-close/SKILL.md'],
    ['templates/claude-skills/project-adoption/SKILL.md', '.claude/skills/project-adoption/SKILL.md'],
    ['templates/claude-skills/session-sync/SKILL.md', '.claude/skills/session-sync/SKILL.md'],
    ['templates/cams/server.ts', 'tools/cams/server.ts'],
    ['templates/cams/package.json', 'tools/cams/package.json'],
    ['templates/cams/tsconfig.json', 'tools/cams/tsconfig.json'],
    ['templates/cams/gitignore.template', 'tools/cams/.gitignore'],
  ];
  for (const [relSrc, relDest] of safeFiles) {
    const src = path.join(CATMS_DIR, relSrc);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(PROJECT_DIR, relDest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, substitute(fs.readFileSync(src, 'utf8'), values));
    if (relDest === 'scripts/branch-audit.sh') fs.chmodSync(dest, 0o755);
    console.log(`  ✓ Updated ${relDest}`);
  }

  // 2. OpenSpec templates
  const openspecDest = path.join(PROJECT_DIR, 'docs/design/openspec-templates');
  if (fs.existsSync(openspecDest)) {
    for (const file of fs.readdirSync(path.join(CATMS_DIR, 'openspec-templates'))) {
      if (!file.endsWith('.md')) continue;
      fs.writeFileSync(
        path.join(openspecDest, file),
        substitute(readTemplate(`openspec-templates/${file}`), values)
      );
    }
    console.log('  ✓ Updated openspec-templates/');
  }

  // 3. Create once files (trackers)
  const createOnceFiles = [
    ['templates/trackers/tasks.md', 'tasks.md'],
    ['templates/trackers/sprint.md', 'sprint.md'],
    ['templates/trackers/decision.md', 'decision.md'],
    ['templates/trackers/log.md', 'log.md'],
    ['templates/trackers/sessions/.gitkeep', 'sessions/.gitkeep'],
  ];
  for (const [relSrc, relDest] of createOnceFiles) {
    const dest = path.join(PROJECT_DIR, relDest);
    const action = copyIfMissing(relSrc, dest, values);
    if (action === 'created') {
      console.log(`  ✓ Created ${relDest} (new in ${latestVersion})`);
    }
  }

  // 4. Merge JSON (.mcp.json)
  const camsMcpConfig = {
    command: 'tools/cams/node_modules/.bin/tsx',
    args: ['tools/cams/server.ts'],
  };
  mergeJson.update(path.join(PROJECT_DIR, '.mcp.json'), camsMcpConfig);
  console.log('  ✓ Updated .mcp.json CAMS server config');

  console.log('');
  // 5. Managed merge blocks (AGENTS.md, CLAUDE.md, CURSOR.md)
  for (const [rel, name] of [
    ['templates/AGENTS.md', 'AGENTS.md'],
    ['templates/CLAUDE.md', 'CLAUDE.md'],
    ['templates/CURSOR.md', 'CURSOR.md'],
  ]) {
    const content = substitute(readTemplate(rel), values);
    const destPath = path.join(PROJECT_DIR, name);
    const action = mergeBlock.update(destPath, content, VERSION);

    if (action === 'updated') {
      console.log(`  ✓ ${name}: CATMS-managed block updated to v${VERSION}`);
    } else if (action === 'missing') {
      mergeBlock.init(destPath, content, VERSION);
      console.log(`  ✓ ${name}: didn't exist, created fresh`);
    } else if (action === 'manual-review-needed') {
      console.log(`  ⚠  ${name}: pre-dates the CATMS marker format. Review and merge manually.`);
    }
  }
  console.log('');

  config.version = latestVersion;
  config.branch_strategy = BRANCH_STRATEGY;
  config.integration_branch = INTEGRATION_BRANCH;
  if (!config.repos) config.repos = [];
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ✓ .catms.json updated to ${latestVersion}`);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  Updated ${config.project} to CATMS ${latestVersion}`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Run npm install inside tools/cams/ to ensure dependencies are installed:');
  console.log('     cd tools/cams && npm install');
  console.log('  2. Commit the updated files:');
  console.log('     git add .cursor/rules/ docs/ scripts/ .claude/skills/ tools/cams/ .catms.json .mcp.json AGENTS.md CLAUDE.md CURSOR.md');
  console.log(`     git commit -m "chore: update CATMS templates to ${latestVersion}"`);
  console.log('');
}

module.exports = { run };
