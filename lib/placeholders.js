'use strict';

const PLACEHOLDER_KEYS = [
  'PROJECT_NAME',
  'GITHUB_USER',
  'LINEAR_TEAM_NAME',
  'LINEAR_TEAM_ID',
  'OBSIDIAN_VAULT_PATH',
  'DROPLET_IP',
  'SETUP_DATE',
];

function substitute(content, values) {
  let out = content;
  for (const key of PLACEHOLDER_KEYS) {
    const value = values[key];
    if (value === undefined) continue;
    out = out.split(`{${key}}`).join(value);
  }
  return out;
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

module.exports = { PLACEHOLDER_KEYS, substitute, todayISODate };
