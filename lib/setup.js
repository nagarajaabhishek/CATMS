'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const { ask, confirm } = require('./prompt');
const { substitute, todayISODate, renderTeamRoster } = require('./placeholders');
const mergeJson = require('./merge-json');
const camsSetup = require('./cams-setup');

const CATMS_DIR = path.join(__dirname, '..');
const PROVIDERS = ['openai', 'voyage', 'ollama'];

/** The nearest directory at or above `start` that has a .catms.json. */
function findProjectDir(start) {
  let dir = path.resolve(start);
  for (;;) {
    if (fs.existsSync(path.join(dir, '.catms.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

function readEnvProvider(envPath) {
  const m = /^EMBED_PROVIDER=(.*)$/m.exec(fs.readFileSync(envPath, 'utf8'));
  return m ? m[1].trim() : 'openai';
}

/**
 * One-time setup of CAMS on a machine for an existing CATMS project: a new
 * teammate after cloning, or you after moving to a new machine. Memory is
 * rebuilt from git, so nothing needs to be copied from another machine.
 */
async function run() {
  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║      CATMS — Set up this machine                     ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');

  const PROJECT_DIR = findProjectDir(process.cwd());
  if (!PROJECT_DIR) {
    console.log(`❌ No .catms.json found in ${process.cwd()} or any parent directory.`);
    console.log('   Clone the project first, or run `catms init` to start a new one.');
    process.exitCode = 1;
    return;
  }
  const config = JSON.parse(fs.readFileSync(path.join(PROJECT_DIR, '.catms.json'), 'utf8'));
  const camsDir = path.join(PROJECT_DIR, 'tools/cams');
  console.log(`Project: ${config.project} (${PROJECT_DIR})`);
  console.log('');

  if (!fs.existsSync(path.join(camsDir, 'server.ts'))) {
    console.log('❌ tools/cams/server.ts is missing. Run `catms update` in this project first, commit, then re-run setup.');
    process.exitCode = 1;
    return;
  }

  // 1. Embedding provider — per developer, never committed.
  console.log('[1/6] Embedding provider for CAMS (your own key; stored only in tools/cams/.env)');
  const envPath = path.join(camsDir, '.env');
  let provider;
  if (fs.existsSync(envPath) && (await confirm('    tools/cams/.env already exists. Keep it?', { defaultYes: true }))) {
    provider = readEnvProvider(envPath);
    console.log(`    ✓ Keeping existing .env (${provider})`);
  } else {
    const suggested = PROVIDERS.includes(config.cams_provider) ? config.cams_provider : 'openai';
    provider = (await ask('    Provider (openai / voyage / ollama)', { default: suggested })).toLowerCase();
    if (!PROVIDERS.includes(provider)) provider = suggested;
    let key = '';
    if (provider !== 'ollama') {
      key = await ask(`    ${provider === 'openai' ? 'OpenAI' : 'Voyage'} API key (blank = keyword-only search for now)`);
    }
    camsSetup.writeCamsEnv(camsDir, provider, key);
    console.log(`    ✓ tools/cams/.env written (${provider}${provider !== 'ollama' && !key ? ', no key — keyword-only' : ''})`);
    if (provider === 'ollama') console.log('    → Make sure Ollama is running: ollama pull mxbai-embed-large');
  }

  // 2. Dependencies.
  console.log('[2/6] Installing CAMS dependencies ...');
  try {
    execFileSync('npm', ['install', '--no-fund', '--no-audit'], { cwd: camsDir, stdio: 'inherit' });
    console.log('    ✓ npm dependencies installed in tools/cams/');
  } catch {
    console.log('    ⚠  npm install failed. Fix the error above, then run: cd tools/cams && npm install');
    process.exitCode = 1;
    return;
  }

  // 3. Git hooks — not cloned with the repo, so every machine needs them.
  console.log('[3/6] Installing git hooks ...');
  camsSetup.printHookResult(camsSetup.installHooks(PROJECT_DIR));

  // 4. MCP registration and shared folders.
  console.log('[4/6] Registering CAMS with your AI tools ...');
  mergeJson.update(path.join(PROJECT_DIR, '.mcp.json'), {
    command: 'tools/cams/node_modules/.bin/tsx',
    args: ['tools/cams/server.ts'],
  });
  console.log('    ✓ .mcp.json has the CAMS server');
  if (camsSetup.ensureFactsDir(PROJECT_DIR)) console.log('    ✓ Created memory/facts/ (commit it)');
  const globalClaude = path.join(os.homedir(), '.claude/CLAUDE.md');
  if (!fs.existsSync(globalClaude)) {
    const values = {
      PROJECT_NAME: config.project,
      GITHUB_USER: config.github_user,
      SETUP_DATE: config.setup_date || todayISODate(),
      INTEGRATION_BRANCH: config.integration_branch || 'main',
      TEAM_ROSTER: renderTeamRoster(config.team),
    };
    fs.mkdirSync(path.dirname(globalClaude), { recursive: true });
    fs.writeFileSync(globalClaude, substitute(fs.readFileSync(path.join(CATMS_DIR, 'templates/CLAUDE.md'), 'utf8'), values));
    console.log('    ✓ ~/.claude/CLAUDE.md created');
  }

  // 5. Who am I on this team — sets the author recorded on facts you save.
  console.log('[5/6] Matching you to the team roster ...');
  const team = Array.isArray(config.team) ? config.team : [];
  const guess = camsSetup.git(['config', '--get', 'github.user'], PROJECT_DIR) || '';
  const githubUser = await ask('    Your GitHub username', { default: guess });
  const member = team.find((m) => (m.github_user || '').toLowerCase() === githubUser.toLowerCase());
  if (member) {
    camsSetup.setClaimTag(PROJECT_DIR, member.claim_tag);
    console.log(`    ✓ You are ${member.name} — claim tag ${member.claim_tag} (used as owner: in tasks.md and as author on CAMS facts)`);
  } else {
    console.log(`    ⚠  ${githubUser || 'You'} isn't in .catms.json's team roster yet.`);
    console.log('       Run `catms team add` (or ask a teammate to), commit .catms.json, then re-run `catms setup`.');
    console.log('       Until then, CAMS facts are attributed to your git user.email.');
  }

  // 6. Build memory from git.
  console.log('[6/6] Building CAMS memory from git (trackers, shared facts, history) ...');
  try {
    execFileSync('node_modules/.bin/tsx', ['server.ts', '--backfill'], { cwd: camsDir, stdio: 'inherit' });
    const sample = execFileSync('node_modules/.bin/tsx', ['server.ts', '--query', 'In Progress tasks'], {
      cwd: camsDir,
      stdio: ['ignore', 'pipe', 'inherit'],
    }).toString();
    const firstHit = sample.split('\n').find((l) => /^1\. \[/.test(l));
    console.log(firstHit ? `    ✓ Test query works — top result: ${firstHit.slice(3)}` : '    ✓ Test query ran (no matching memory yet)');
  } catch {
    console.log('    ⚠  Backfill failed — see the error above. Retry with: cd tools/cams && npm run backfill');
    process.exitCode = 1;
    return;
  }

  console.log('');
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log(`║  This machine is set up for ${config.project}`);
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log('');
  console.log('  • Memory now stays in sync on every pull, rebase, and branch switch (git hooks).');
  console.log('  • Facts you save with cams_ingest land in memory/facts/ — commit and push them with your trackers.');
  console.log('  • Moved from another machine that had facts not yet in memory/facts/? Import its old file once:');
  console.log('      cd tools/cams && npm run import -- /path/to/old/memory.ndjson');
  console.log('  • Next: open the project in Claude Code or Cursor and start with log.md\'s top entry.');
  console.log('');
}

module.exports = { run, findProjectDir };
