'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { ask, confirm } = require('./prompt');
const { substitute, todayISODate } = require('./placeholders');
const mergeBlock = require('./merge-block');
const mergeJson = require('./merge-json');

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
  const EMBED_PROVIDER = (await ask('Embedding provider (openai / voyage / ollama) [default: openai]')) || 'openai';

  let API_KEY = '';
  if (EMBED_PROVIDER === 'openai') {
    API_KEY = await ask('OpenAI API Key');
  } else if (EMBED_PROVIDER === 'voyage') {
    API_KEY = await ask('Voyage API Key');
  }

  const BRANCH_STRATEGY = (await ask('Branch strategy — single-stage (feat→main) or two-stage (feat→dev→main)? [default: single-stage]')) || 'single-stage';
  const INTEGRATION_BRANCH = BRANCH_STRATEGY === 'two-stage' ? 'dev' : 'main';

  const TARGET_DIR = expandHome(await ask('Target project directory (where to copy templates, e.g. ~/projects/my-app)'));
  const DROPLET_IP = await ask('Server/droplet IP (leave blank if not applicable)');

  console.log('');
  console.log('── Summary ──────────────────────────────────────────────');
  console.log(`  Project:        ${PROJECT_NAME}`);
  console.log(`  GitHub user:    ${GITHUB_USER}`);
  console.log(`  CAMS Provider:  ${EMBED_PROVIDER}`);
  console.log(`  Branch strategy: ${BRANCH_STRATEGY} (integration branch: ${INTEGRATION_BRANCH})`);
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
    DROPLET_IP: DROPLET_IP || 'YOUR_SERVER_IP',
    SETUP_DATE: todayISODate(),
    INTEGRATION_BRANCH,
  };

  // Multi-repo workspace detection — immediate subdirectories with a .git
  // folder become the `repos` list scripts/branch-audit.sh iterates.
  let REPOS = [];
  try {
    REPOS = fs
      .readdirSync(TARGET_DIR, { withFileTypes: true })
      .filter((e) => e.isDirectory() && fs.existsSync(path.join(TARGET_DIR, e.name, '.git')))
      .map((e) => e.name);
  } catch {
    REPOS = []; // TARGET_DIR doesn't exist yet — created below, nothing to scan yet
  }

  // Existing-project detection — a repo with real commit history is a
  // candidate for the project-adoption skill (seeds trackers from the
  // actual codebase instead of starting genuinely blank). A handful of
  // commits or fewer isn't worth flagging.
  function commitCount(dir) {
    try {
      return parseInt(execFileSync('git', ['-C', dir, 'rev-list', '--count', 'HEAD'], { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim(), 10) || 0;
    } catch {
      return 0;
    }
  }
  const dirsToCheck = REPOS.length > 0 ? REPOS.map((r) => path.join(TARGET_DIR, r)) : [TARGET_DIR];
  const HAS_EXISTING_HISTORY = dirsToCheck.some((d) => commitCount(d) > 5);

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

  const branchingTemplate = BRANCH_STRATEGY === 'two-stage'
    ? 'templates/branching/two-stage.md'
    : 'templates/branching/single-stage.md';
  copyPlain(branchingTemplate, path.join(TARGET_DIR, 'docs/BRANCHING.md'), values);
  copyPlain('templates/docs/SPRINT-WORKFLOW.md', path.join(TARGET_DIR, 'docs/SPRINT-WORKFLOW.md'), values);

  copyPlain('templates/scripts/branch-audit.sh', path.join(TARGET_DIR, 'scripts/branch-audit.sh'), values);
  fs.chmodSync(path.join(TARGET_DIR, 'scripts/branch-audit.sh'), 0o755);

  for (const skill of ['task-kickoff', 'sprint-planning', 'pr-checks-loop', 'sprint-close', 'project-adoption', 'session-sync', 'architecture-diagram', 'team-onboarding']) {
    copyPlain(`templates/claude-skills/${skill}/SKILL.md`, path.join(TARGET_DIR, `.claude/skills/${skill}/SKILL.md`), values);
  }

  const openspecDir = path.join(TARGET_DIR, 'docs/design/openspec-templates');
  fs.mkdirSync(openspecDir, { recursive: true });
  for (const file of fs.readdirSync(path.join(CATMS_DIR, 'openspec-templates'))) {
    if (!file.endsWith('.md')) continue;
    copyPlain(`openspec-templates/${file}`, path.join(openspecDir, file), values);
  }

  // Copy local trackers
  copyIfMissing('templates/trackers/tasks.md', path.join(TARGET_DIR, 'tasks.md'), values);
  copyIfMissing('templates/trackers/sprint.md', path.join(TARGET_DIR, 'sprint.md'), values);
  copyIfMissing('templates/trackers/decision.md', path.join(TARGET_DIR, 'decision.md'), values);
  copyIfMissing('templates/trackers/log.md', path.join(TARGET_DIR, 'log.md'), values);
  fs.mkdirSync(path.join(TARGET_DIR, 'sessions'), { recursive: true });
  copyIfMissing('templates/trackers/sessions/.gitkeep', path.join(TARGET_DIR, 'sessions/.gitkeep'), values);

  console.log('    ✓ Template, branching/sprint docs, skills, and tracker files copied');

  console.log(`[2/4] Setting up lightweight CAMS at ${path.join(TARGET_DIR, 'tools/cams')} ...`);
  const camsDest = path.join(TARGET_DIR, 'tools/cams');
  fs.mkdirSync(camsDest, { recursive: true });

  copyPlain('templates/cams/server.ts', path.join(camsDest, 'server.ts'), values);
  copyPlain('templates/cams/package.json', path.join(camsDest, 'package.json'), values);
  copyPlain('templates/cams/tsconfig.json', path.join(camsDest, 'tsconfig.json'), values);
  copyPlain('templates/cams/gitignore.template', path.join(camsDest, '.gitignore'), values);

  let envContent = `# CAMS Environment Configuration\nEMBED_PROVIDER=${EMBED_PROVIDER}\n`;
  if (EMBED_PROVIDER === 'openai') {
    envContent += `OPENAI_API_KEY=${API_KEY}\n`;
  } else if (EMBED_PROVIDER === 'voyage') {
    envContent += `VOYAGE_API_KEY=${API_KEY}\n`;
  } else {
    envContent += `OLLAMA_HOST=http://127.0.0.1:11434\nOLLAMA_EMBED_MODEL=mxbai-embed-large\n`;
  }
  fs.writeFileSync(path.join(camsDest, '.env'), envContent);

  // Copy git hooks if .git exists (for existing projects being initialized)
  const gitDir = path.join(TARGET_DIR, '.git');
  if (fs.existsSync(gitDir)) {
    const hookDest = path.join(gitDir, 'hooks/post-merge');
    const hookSrc = path.join(CATMS_DIR, 'templates/cams/hooks/post-merge');
    if (fs.existsSync(hookSrc)) {
      fs.mkdirSync(path.dirname(hookDest), { recursive: true });
      fs.copyFileSync(hookSrc, hookDest);
      fs.chmodSync(hookDest, 0o755);
    }
  }

  // Copy watch-sync.sh for optional continuous sync
  const watchSyncSrc = path.join(CATMS_DIR, 'templates/cams/watch-sync.sh');
  if (fs.existsSync(watchSyncSrc)) {
    const watchSyncDest = path.join(camsDest, 'watch-sync.sh');
    fs.copyFileSync(watchSyncSrc, watchSyncDest);
    fs.chmodSync(watchSyncDest, 0o755);
  }

  console.log('    ✓ CAMS server files, .env, and git hooks initialized');

  console.log(`[3/4] Writing .catms.json and registering MCP server ...`);
  fs.writeFileSync(
    path.join(TARGET_DIR, '.catms.json'),
    JSON.stringify(
      {
        version: `v${VERSION}`,
        project: PROJECT_NAME,
        github_user: GITHUB_USER,
        cams_provider: EMBED_PROVIDER,
        branch_strategy: BRANCH_STRATEGY,
        integration_branch: INTEGRATION_BRANCH,
        repos: REPOS,
        catms_repo: 'https://github.com/nagarajaabhishek/CATMS',
        setup_date: values.SETUP_DATE,
        team: [
          {
            name: 'You',
            github_user: GITHUB_USER,
            claim_tag: '@you',
          },
        ],
      },
      null,
      2
    ) + '\n'
  );

  const camsMcpConfig = {
    command: 'tools/cams/node_modules/.bin/tsx',
    args: ['tools/cams/server.ts'],
  };
  mergeJson.update(path.join(TARGET_DIR, '.mcp.json'), camsMcpConfig);
  console.log('    ✓ .catms.json written and CAMS MCP server registered in .mcp.json');

  const globalClaude = path.join(os.homedir(), '.claude/CLAUDE.md');
  console.log('[3b/4] Checking ~/.claude/CLAUDE.md ...');
  if (fs.existsSync(globalClaude)) {
    console.log('    ⚠  ~/.claude/CLAUDE.md already exists — skipping (update manually if needed)');
  } else {
    copyPlain('templates/CLAUDE.md', globalClaude, values);
    console.log('    ✓ ~/.claude/CLAUDE.md created');
  }

  console.log('[3c/4] Running npm install in tools/cams/ ...');
  try {
    execFileSync('npm', ['install'], { cwd: camsDest, stdio: 'inherit' });
    console.log('    ✓ npm dependencies installed in tools/cams/');
  } catch (e) {
    console.log('    ⚠  Failed to run npm install in tools/cams/. Please run manually:');
    console.log(`       cd ${path.join(TARGET_DIR, 'tools/cams')} && npm install`);
  }

  if (EMBED_PROVIDER === 'ollama') {
    console.log('');
    console.log('  Reminder: Make sure Ollama is running and the model is pulled:');
    console.log('  → ollama pull mxbai-embed-large');
  }

  console.log('[4/4] Done!');
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  CATMS setup complete for: ${PROJECT_NAME}`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Next steps:');
  console.log('');
  console.log('  1. Run CAMS backfill to sync initial memory:');
  console.log(`     → cd ${path.join(TARGET_DIR, 'tools/cams')} && npm run backfill`);
  console.log('');
  console.log('  2. Open your project in Cursor or Google Antigravity:');
  console.log('     → both read AGENTS.md natively, no extra setup needed');
  console.log('     → Cursor also auto-applies .cursor/rules/*.mdc to every chat');
  console.log('');
  console.log('  3. Start your first session:');
  console.log(`     → Read tasks.md and log.md`);
  console.log(`     → Branch discipline: docs/BRANCHING.md (${BRANCH_STRATEGY}) · Sprint workflow: docs/SPRINT-WORKFLOW.md`);
  console.log('     → Claude Code: 7 skills installed in .claude/skills/ (task-kickoff, sprint-planning, pr-checks-loop,');
  console.log('       sprint-close, project-adoption, session-sync, architecture-diagram)');
  console.log('');

  if (HAS_EXISTING_HISTORY) {
    console.log('  4. This looks like an existing project, not a fresh one:');
    console.log('     → tasks.md/decision.md/log.md were just created empty — CATMS has no memory of your prior work yet');
    console.log('     → In Claude Code, run the project-adoption skill (.claude/skills/project-adoption/) before your');
    console.log('       first real session — it reads your git history/README/stack and seeds the trackers with real');
    console.log('       context, then backfills CAMS, instead of starting genuinely blank');
    console.log('');
  }
}

module.exports = { run };
