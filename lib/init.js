'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

const { ask, confirm } = require('./prompt');
const { substitute, todayISODate } = require('./placeholders');
const mergeBlock = require('./merge-block');

const CATMS_DIR = path.join(__dirname, '..');
const VERSION = require('../package.json').version;

function expandHome(p) {
  if (!p) return p;
  return p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p;
}

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

function initManaged(relSrc, destPath, values) {
  const content = substitute(readTemplate(relSrc), values);
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  return mergeBlock.init(destPath, content, VERSION);
}

async function run() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║     CATMS — Coding Agents Team Management System     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  const PROJECT_NAME = await ask('Project name (e.g. my-app)');
  const GITHUB_USER = await ask('GitHub username');
  const LINEAR_TEAM_NAME = await ask('Linear team name (e.g. My Team)');
  const LINEAR_TEAM_ID = await ask('Linear team ID (UUID from Linear API settings)');
  const OBSIDIAN_VAULT_PATH = expandHome(await ask('Obsidian vault path (e.g. ~/Documents/obsidian-vault)'));
  const TARGET_DIR = expandHome(await ask('Target project directory (where to copy templates, e.g. ~/projects/my-app)'));
  const DROPLET_IP = await ask('Server/droplet IP (leave blank if not applicable)');

  console.log('');
  console.log('── Summary ──────────────────────────────────────────────');
  console.log(`  Project:        ${PROJECT_NAME}`);
  console.log(`  GitHub user:    ${GITHUB_USER}`);
  console.log(`  Linear team:    ${LINEAR_TEAM_NAME} (${LINEAR_TEAM_ID})`);
  console.log(`  Obsidian vault: ${OBSIDIAN_VAULT_PATH}`);
  console.log(`  Target dir:     ${TARGET_DIR}`);
  console.log(`  Droplet IP:     ${DROPLET_IP || '(none)'}`);
  console.log('─────────────────────────────────────────────────────────');

  const proceed = await confirm('Proceed?');
  if (!proceed) {
    console.log('Aborted.');
    return;
  }

  const values = {
    PROJECT_NAME,
    GITHUB_USER,
    LINEAR_TEAM_NAME,
    LINEAR_TEAM_ID,
    OBSIDIAN_VAULT_PATH,
    DROPLET_IP: DROPLET_IP || 'YOUR_SERVER_IP',
    SETUP_DATE: todayISODate(),
  };

  console.log('');
  console.log(`[1/4] Copying templates to ${TARGET_DIR} ...`);
  fs.mkdirSync(TARGET_DIR, { recursive: true });

  for (const [rel, name] of [
    ['templates/AGENTS.md', 'AGENTS.md'],
    ['templates/CLAUDE.md', 'CLAUDE.md'],
    ['templates/CURSOR.md', 'CURSOR.md'],
  ]) {
    const action = initManaged(rel, path.join(TARGET_DIR, name), values);
    const label = { created: 'Created', appended: 'Appended CATMS block to existing', 'already-initialized': 'Already initialized, left as-is' }[action];
    console.log(`    ✓ ${name}: ${label}`);
  }

  copyPlain('templates/.cursor/rules/workflow.mdc', path.join(TARGET_DIR, '.cursor/rules/workflow.mdc'), values);
  copyPlain('templates/.cursor/rules/git-workflow.mdc', path.join(TARGET_DIR, '.cursor/rules/git-workflow.mdc'), values);
  copyPlain('templates/docs/GIT_WORKFLOW.md', path.join(TARGET_DIR, 'docs/GIT_WORKFLOW.md'), values);

  const openspecDir = path.join(TARGET_DIR, 'docs/design/openspec-templates');
  fs.mkdirSync(openspecDir, { recursive: true });
  for (const file of fs.readdirSync(path.join(CATMS_DIR, 'openspec-templates'))) {
    if (!file.endsWith('.md')) continue;
    copyPlain(`openspec-templates/${file}`, path.join(openspecDir, file), values);
  }

  console.log('    ✓ Template files copied and customised');

  console.log(`[2/4] Setting up Obsidian vault at ${OBSIDIAN_VAULT_PATH} ...`);
  const vaultProject = path.join(OBSIDIAN_VAULT_PATH, 'projects', PROJECT_NAME);
  for (const dir of [
    path.join(OBSIDIAN_VAULT_PATH, 'context'),
    path.join(vaultProject, 'context'),
    path.join(vaultProject, 'sessions'),
    path.join(vaultProject, 'design/changes'),
    path.join(vaultProject, 'design/archive'),
    path.join(vaultProject, 'design/decisions'),
    path.join(vaultProject, 'testing/bugs'),
  ]) {
    fs.mkdirSync(dir, { recursive: true });
  }

  copyIfMissing(
    'obsidian-template/context/active-projects.md',
    path.join(OBSIDIAN_VAULT_PATH, 'context/active-projects.md'),
    values
  );

  for (const tmpl of ['overview.md', 'context.md', 'index.md', 'log.md']) {
    copyIfMissing(
      `obsidian-template/projects/{PROJECT_NAME}/${tmpl}`,
      path.join(vaultProject, tmpl),
      values
    );
  }

  for (const tmpl of ['infra.md', 'decisions.md']) {
    copyIfMissing(
      `obsidian-template/projects/{PROJECT_NAME}/context/${tmpl}`,
      path.join(vaultProject, 'context', tmpl),
      values
    );
  }

  for (const rel of ['design/specs.md', 'sessions/.gitkeep', 'testing/bugs/.gitkeep']) {
    const p = path.join(vaultProject, rel);
    if (!fs.existsSync(p)) fs.writeFileSync(p, '');
  }

  console.log('    ✓ Obsidian vault structure created');

  console.log(`[3/4] Writing .catms.json to ${TARGET_DIR} ...`);
  fs.writeFileSync(
    path.join(TARGET_DIR, '.catms.json'),
    JSON.stringify(
      {
        version: `v${VERSION}`,
        project: PROJECT_NAME,
        github_user: GITHUB_USER,
        linear_team_name: LINEAR_TEAM_NAME,
        linear_team_id: LINEAR_TEAM_ID,
        obsidian_vault_path: OBSIDIAN_VAULT_PATH,
        catms_repo: 'https://github.com/nagarajaabhishek/CATMS',
        setup_date: values.SETUP_DATE,
      },
      null,
      2
    ) + '\n'
  );
  console.log(`    ✓ .catms.json written (v${VERSION})`);

  const globalClaude = path.join(os.homedir(), '.claude/CLAUDE.md');
  console.log('[3b/4] Checking ~/.claude/CLAUDE.md ...');
  if (fs.existsSync(globalClaude)) {
    console.log('    ⚠  ~/.claude/CLAUDE.md already exists — skipping (update manually if needed)');
  } else {
    copyPlain('templates/CLAUDE.md', globalClaude, values);
    console.log('    ✓ ~/.claude/CLAUDE.md created');
  }

  console.log('[4/4] Done!');
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  CATMS setup complete for: ${PROJECT_NAME}`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Next steps:');
  console.log('');
  console.log('  1. Linear setup:');
  console.log('     → Follow linear-setup.md to create your team, states, and projects');
  console.log('');
  console.log('  2. Add MCP tools to Claude Code:');
  console.log('     → claude mcp add -s user linear-mcp (with LINEAR_API_KEY)');
  console.log('');
  console.log('  3. Open your project in Cursor or Google Antigravity:');
  console.log('     → both read AGENTS.md natively, no extra setup needed');
  console.log('     → Cursor also auto-applies .cursor/rules/*.mdc to every chat');
  console.log('');
  console.log('  4. Start your first session:');
  console.log(`     → Read ${path.join(OBSIDIAN_VAULT_PATH, 'context/active-projects.md')}`);
  console.log('     → Create your first Linear issue with [P1][You] or [P1][Agent] prefix');
  console.log('');
}

module.exports = { run };
