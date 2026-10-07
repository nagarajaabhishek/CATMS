'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const CATMS_DIR = path.join(__dirname, '..');
const HOOK_NAMES = ['post-merge', 'post-checkout', 'post-rewrite'];
// Markers of hooks CATMS wrote itself (current and v0.7 post-merge), safe to overwrite.
const OURS = ['CATMS CAMS hook', 'CATMS post-merge git hook'];

function git(args, cwd) {
  try {
    return execFileSync('git', args, { cwd, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
  } catch {
    return null;
  }
}

/**
 * Installs the CAMS backfill hook as post-merge, post-checkout and post-rewrite.
 * Respects core.hooksPath. Never overwrites a hook CATMS didn't write.
 */
function installHooks(projectDir) {
  const top = git(['rev-parse', '--show-toplevel'], projectDir);
  if (!top) return { installed: [], skipped: [], notRepo: true };
  const hooksDir = path.resolve(projectDir, git(['rev-parse', '--git-path', 'hooks'], projectDir));
  const camsRel = path.relative(top, path.join(projectDir, 'tools/cams')).split(path.sep).join('/') || '.';
  const content = fs
    .readFileSync(path.join(CATMS_DIR, 'templates/cams/hooks/backfill-hook.sh'), 'utf8')
    .split('__CAMS_DIR__')
    .join(camsRel);

  fs.mkdirSync(hooksDir, { recursive: true });
  const installed = [];
  const skipped = [];
  for (const name of HOOK_NAMES) {
    const dest = path.join(hooksDir, name);
    // lstat, not exists: a symlinked hook (e.g. an older setup that linked to tools/cams/hooks/) would
    // otherwise be written *through*, overwriting a tracked file in the working tree. Leave it alone.
    let isLink = false;
    try { isLink = fs.lstatSync(dest).isSymbolicLink(); } catch { /* absent */ }
    if (isLink) {
      skipped.push(name);
      continue;
    }
    if (fs.existsSync(dest)) {
      const existing = fs.readFileSync(dest, 'utf8');
      if (!OURS.some((marker) => existing.includes(marker))) {
        skipped.push(name);
        continue;
      }
    }
    fs.writeFileSync(dest, content);
    fs.chmodSync(dest, 0o755);
    installed.push(name);
  }
  return { installed, skipped, notRepo: false };
}

function printHookResult(result, indent = '    ') {
  if (result.notRepo) {
    console.log(`${indent}ℹ  Not a git repo yet — run \`catms setup\` after the first commit to install git hooks`);
    return;
  }
  if (result.installed.length > 0) console.log(`${indent}✓ Git hooks installed: ${result.installed.join(', ')}`);
  for (const name of result.skipped) {
    console.log(`${indent}⚠  .git/hooks/${name} already exists and isn't a CATMS hook — left alone.`);
    console.log(`${indent}   Add this line to it to keep CAMS in sync: (cd tools/cams && npm run backfill >/dev/null 2>&1 &)`);
  }
}

/** Writes tools/cams/.env for one developer's embedding provider (never committed). */
function writeCamsEnv(camsDir, provider, apiKey) {
  let env = `# CAMS Environment Configuration (this machine only — never committed)\nEMBED_PROVIDER=${provider}\n`;
  if (provider === 'openai') {
    env += `OPENAI_API_KEY=${apiKey || ''}\n`;
  } else if (provider === 'voyage') {
    env += `VOYAGE_API_KEY=${apiKey || ''}\n`;
  } else {
    env += 'OLLAMA_HOST=http://127.0.0.1:11434\nOLLAMA_EMBED_MODEL=mxbai-embed-large\n';
  }
  fs.mkdirSync(camsDir, { recursive: true });
  fs.writeFileSync(path.join(camsDir, '.env'), env);
}

/** Creates memory/facts/ (where cams_ingest writes shared facts) with a .gitkeep. */
function ensureFactsDir(projectDir) {
  const dir = path.join(projectDir, 'memory/facts');
  fs.mkdirSync(dir, { recursive: true });
  const keep = path.join(dir, '.gitkeep');
  if (!fs.existsSync(keep)) {
    fs.writeFileSync(keep, '');
    return true;
  }
  return false;
}

/** Records who cams_ingest attributes facts to on this machine. */
function setClaimTag(projectDir, claimTag) {
  return git(['config', '--local', 'catms.claimTag', claimTag], projectDir) !== null;
}

module.exports = { installHooks, printHookResult, writeCamsEnv, ensureFactsDir, setClaimTag, git };
