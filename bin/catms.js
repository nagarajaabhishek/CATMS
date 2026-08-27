#!/usr/bin/env node
'use strict';

const { version } = require('../package.json');
const { closeInterface } = require('../lib/prompt');

const HELP = `catms — Coding Agents Team Management System

Usage:
  catms init      Scaffold CATMS (AGENTS.md, CLAUDE.md, CURSOR.md, trackers, CAMS) into a project
  catms update     Pull the latest CATMS templates and trackers into a project that already uses CATMS
  catms --version  Print the CATMS version
  catms --help     Show this help
`;

async function main() {
  const cmd = process.argv[2];

  switch (cmd) {
    case 'init':
      await require('../lib/init').run();
      break;
    case 'update':
      await require('../lib/update').run();
      break;
    case '--version':
    case '-v':
      console.log(version);
      break;
    case '--help':
    case '-h':
    case undefined:
      console.log(HELP);
      break;
    default:
      console.log(`Unknown command: ${cmd}\n`);
      console.log(HELP);
      process.exitCode = 1;
  }
}

main()
  .catch((err) => {
    console.error(err.message || err);
    process.exitCode = 1;
  })
  .finally(() => closeInterface());
