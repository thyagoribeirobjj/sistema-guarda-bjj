// What tests/smoke.mjs and tests/signed-in.mjs (and their -kids, -tv, -coach, -usability parts) share: step() runs
// one named step and says what failed and where, until() waits for something to become true.
import { inspect } from 'node:util';

export const problems = [];

export async function step(name, run) {
  try {
    await run();
    console.log(`PASS  ${name}`);
  } catch (error) {
    const [first, ...details] = failure(error);
    problems.push([`${name}: ${first}`, ...details].join('\n    '));
    console.log([`FAIL  ${name}: ${first}`, ...details].join('\n      '));
  }
}

// The first line of the error, then where in tests/ it happened, what a timeout was waiting for, and for an assert
// what it got and what it expected.
export function failure(error) {
  // Playwright greys its call log out with terminal colour codes.
  const message = String(error?.message ?? error).replace(/\u001b\[\d+m/g, '');
  const lines = [message.split('\n')[0]];
  const place = (error?.stack || '').split('\n').map((line) => line.match(/(tests\/(?!browser\.mjs)[\w-]+\.m?js):(\d+)/)).find(Boolean);
  if (place) lines.push(`at ${place[1]}:${place[2]}`);
  const waiting = message.split('\n').find((line) => /^\s*-?\s*waiting for /.test(line));
  if (waiting) lines.push(waiting.trim().replace(/^- /, ''));
  if (error?.code === 'ERR_ASSERTION') {
    lines.push(`actual:   ${shown(error.actual)}`, `expected: ${shown(error.expected)}`);
  }
  return lines;
}

const shown = (value) => inspect(value, { depth: 4, breakLength: Infinity, maxStringLength: 300, maxArrayLength: 20 });

// Waits until check() (sync or async) gives something true and returns it; its errors count as "not yet".
export async function until(check, what, timeout = 10000) {
  const end = Date.now() + timeout;
  let last;
  while (Date.now() < end) {
    try {
      last = await check();
      if (last) return last;
    } catch (error) {
      last = error.message;
    }
    await new Promise((done) => setTimeout(done, 200));
  }
  throw new Error(`waited for ${what} (last seen: ${JSON.stringify(last)})`);
}
