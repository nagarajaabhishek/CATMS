'use strict';

const PLACEHOLDER_KEYS = [
  'PROJECT_NAME',
  'GITHUB_USER',
  'DROPLET_IP',
  'SETUP_DATE',
  'INTEGRATION_BRANCH',
  'TEAM_ROSTER',
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

function renderTeamRoster(team) {
  if (!Array.isArray(team) || team.length === 0) {
    return '(no team members registered yet)';
  }
  return team.map((member) => `- ${member.name} (@${member.github_user}) — claim tag: ${member.claim_tag}`).join('\n');
}

module.exports = { PLACEHOLDER_KEYS, substitute, todayISODate, renderTeamRoster };
