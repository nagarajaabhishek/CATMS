'use strict';

const fs = require('fs');
const path = require('path');

const { confirm } = require('./prompt');
const { substitute } = require('./placeholders');
const mergeBlock = require('./merge-block');

const CATMS_DIR = path.join(__dirname, '..');
const VERSION = require('../package.json').version;

function readTemplate(relPath) {
  return fs.readFileSync(path.join(CATMS_DIR, relPath), 'utf8');
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

  const values = {
    PROJECT_NAME: config.project,
    GITHUB_USER: config.github_user,
    LINEAR_TEAM_NAME: config.linear_team_name,
    LINEAR_TEAM_ID: config.linear_team_id,
    OBSIDIAN_VAULT_PATH: config.obsidian_vault_path,
  };

  console.log('');
  console.log('Applying updates...');

  const safeFiles = [
    '.cursor/rules/workflow.mdc',
    '.cursor/rules/git-workflow.mdc',
    'docs/GIT_WORKFLOW.md',
  ];
  for (const rel of safeFiles) {
    const src = path.join(CATMS_DIR, 'templates', rel);
    if (!fs.existsSync(src)) continue;
    const dest = path.join(PROJECT_DIR, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, substitute(fs.readFileSync(src, 'utf8'), values));
    console.log(`  ✓ Updated ${rel}`);
  }

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

  const milestonesDest = path.join(PROJECT_DIR, 'docs/linear-milestones.md');
  const milestonesSrc = path.join(CATMS_DIR, 'linear-milestones.md');
  if (!fs.existsSync(milestonesDest) && fs.existsSync(milestonesSrc)) {
    fs.mkdirSync(path.dirname(milestonesDest), { recursive: true });
    fs.writeFileSync(milestonesDest, substitute(fs.readFileSync(milestonesSrc, 'utf8'), values));
    console.log(`  ✓ Added docs/linear-milestones.md (new in ${latestVersion})`);
  }

  console.log('');
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
      console.log(`  ⚠  ${name}: pre-dates the CATMS marker format (from the old bash-script era).`);
      console.log(`     Review the diff and merge manually if needed:`);
      console.log(`     diff ${destPath} ${path.join(CATMS_DIR, rel)}`);
    }
  }
  console.log('');

  config.version = latestVersion;
  fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + '\n');
  console.log(`  ✓ .catms.json updated to ${latestVersion}`);

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  Updated ${config.project} to CATMS ${latestVersion}`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Next steps:');
  console.log('  1. Review any "manual review" notes above');
  console.log('  2. Commit the updated files:');
  console.log('     git add .cursor/rules/ docs/ .catms.json AGENTS.md CLAUDE.md CURSOR.md');
  console.log(`     git commit -m "chore: update CATMS templates to ${latestVersion}"`);
  console.log('');
}

module.exports = { run };
