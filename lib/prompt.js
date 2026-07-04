'use strict';

const readline = require('readline');

// Shared interface + async iterator across the whole CLI session. Using
// rl.question() repeatedly is racy on a piped (non-TTY) stdin: readline
// drains the whole pipe and emits 'line' events as fast as it can, so lines
// that arrive before the next question() call registers its callback get
// dropped. Consuming lines via the async iterator instead queues them
// properly regardless of timing.
let iface = null;
let iterator = null;

function getIterator() {
  if (!iface) {
    iface = readline.createInterface({ input: process.stdin, output: process.stdout });
    iterator = iface[Symbol.asyncIterator]();
  }
  return iterator;
}

function closeInterface() {
  if (iface) {
    iface.close();
    iface = null;
    iterator = null;
  }
}

async function ask(question, { default: defaultValue } = {}) {
  const suffix = defaultValue ? ` (${defaultValue})` : '';
  process.stdout.write(`${question}${suffix}: `);
  const { value, done } = await getIterator().next();
  if (done) return defaultValue || '';
  return value.trim() || defaultValue || '';
}

async function confirm(question, { defaultYes = false } = {}) {
  const hint = defaultYes ? '[Y/n]' : '[y/N]';
  const answer = await ask(`${question} ${hint}`);
  if (!answer) return defaultYes;
  return /^y(es)?$/i.test(answer);
}

module.exports = { ask, confirm, closeInterface };
