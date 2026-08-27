'use strict';

const fs = require('fs');

/**
 * Add/update the "cams" entry inside a JSON file's `mcpServers` object,
 * without touching any other server already registered there.
 * - missing file          -> create it with just { mcpServers: { cams: config } }
 * - exists, "cams" absent -> add it, preserve everything else
 * - exists, "cams" present -> overwrite just that entry, preserve everything else
 * Returns 'created' | 'added' | 'updated'.
 */
function update(filePath, config) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify({ mcpServers: { cams: config } }, null, 2) + '\n');
    return 'created';
  }

  const existing = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (!existing.mcpServers) existing.mcpServers = {};
  const action = Object.prototype.hasOwnProperty.call(existing.mcpServers, 'cams') ? 'updated' : 'added';
  existing.mcpServers.cams = config;
  fs.writeFileSync(filePath, JSON.stringify(existing, null, 2) + '\n');
  return action;
}

module.exports = { update };
