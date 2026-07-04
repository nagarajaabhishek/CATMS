'use strict';

const fs = require('fs');

const BLOCK_RE = /<!-- CATMS:BEGIN v[^\n]*-->\n[\s\S]*?<!-- CATMS:END -->/;

function wrap(content, version) {
  return `<!-- CATMS:BEGIN v${version} — managed by \`catms update\`, do not hand-edit between these markers -->\n${content.trimEnd()}\n<!-- CATMS:END -->`;
}

/**
 * Write a CATMS-managed block into filePath.
 * - missing file            -> create it with just the wrapped block
 * - exists, no CATMS markers -> append the wrapped block below existing content
 * - exists, already has markers -> no-op (already initialized; use update() instead)
 * Returns one of: 'created' | 'appended' | 'already-initialized'
 */
function init(filePath, content, version) {
  const block = wrap(content, version);

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, `${block}\n`);
    return 'created';
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  if (BLOCK_RE.test(existing)) {
    return 'already-initialized';
  }

  const separator = existing.endsWith('\n') ? '\n' : '\n\n';
  fs.writeFileSync(filePath, `${existing}${separator}${block}\n`);
  return 'appended';
}

/**
 * Update the CATMS-managed block in filePath to new content.
 * - missing file        -> 'missing' (caller decides whether to create fresh)
 * - markers found        -> replace only the block, preserve everything else -> 'updated'
 * - no markers found     -> leave file untouched, caller should print a manual-merge hint -> 'manual-review-needed'
 */
function update(filePath, content, version) {
  if (!fs.existsSync(filePath)) {
    return 'missing';
  }

  const existing = fs.readFileSync(filePath, 'utf8');
  if (!BLOCK_RE.test(existing)) {
    return 'manual-review-needed';
  }

  const block = wrap(content, version);
  const updated = existing.replace(BLOCK_RE, block);
  fs.writeFileSync(filePath, updated);
  return 'updated';
}

module.exports = { wrap, init, update, BLOCK_RE };
