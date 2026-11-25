import { test } from 'node:test';
import assert from 'node:assert/strict';
import { qrModules, errorCorrection, formatBits, versionBits } from '../js/qr.js';

test('error correction matches the standard\'s worked example ("HELLO WORLD", version 1-M)', () => {
  const data = [32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236, 17, 236, 17];
  assert.deepEqual(errorCorrection(data, 10), [196, 35, 39, 119, 235, 215, 231, 226, 93, 23]);
});

test('format and version information match the standard\'s tables', () => {
  assert.equal(formatBits(0, 0).toString(2).padStart(15, '0'), '101010000010010'); // M, mask 0
  assert.equal(formatBits(1, 0).toString(2).padStart(15, '0'), '111011111000100'); // L, mask 0
  assert.equal(formatBits(0, 5).toString(2).padStart(15, '0'), '100000011001110'); // M, mask 5
  assert.equal(versionBits(7).toString(2).padStart(18, '0'), '000111110010010100');
});

// The format information the square carries (its first copy, beside the top-left finder).
function readBack(square) {
  const size = square.length;
  let format = 0;
  for (let i = 0; i <= 5; i++) format |= (square[i][8] ? 1 : 0) << i;
  format |= (square[7][8] ? 1 : 0) << 6;
  format |= (square[8][8] ? 1 : 0) << 7;
  format |= (square[8][7] ? 1 : 0) << 8;
  for (let i = 9; i < 15; i++) format |= (square[8][14 - i] ? 1 : 0) << i;
  const mask = ((format ^ 0x5412) >>> 10) & 7;
  return { size, mask, level: ((format ^ 0x5412) >>> 13) & 3 };
}

test('a link becomes a square of the right size, with its finder patterns, level M and a valid mask', () => {
  const link = 'https://sistemaguarda.com/admin.html#tv=K7P4';
  const square = qrModules(link);
  assert.equal(square.length, 33, 'version 4: 44 bytes need more than version 3-M holds');
  const { mask, level } = readBack(square);
  assert.equal(level, 0, 'level M');
  assert.ok(mask >= 0 && mask < 8);
  // The three finder patterns: a dark 7×7 ring around a dark 3×3 centre.
  for (const [x, y] of [[0, 0], [square.length - 7, 0], [0, square.length - 7]]) {
    for (let dy = 0; dy < 7; dy++) {
      for (let dx = 0; dx < 7; dx++) {
        const ring = Math.max(Math.abs(dx - 3), Math.abs(dy - 3));
        assert.equal(square[y + dy][x + dx], ring !== 2, `finder at ${x},${y}`);
      }
    }
  }
  // The timing lines alternate.
  for (let i = 8; i < square.length - 8; i++) assert.equal(square[6][i], i % 2 === 0);
  assert.equal(qrModules('short').length, 21, 'version 1 for a few letters');
  assert.throws(() => qrModules('x'.repeat(300)));
});

test('the same text always gives the same square, and each mask gives a different one', () => {
  const link = 'https://sistemaguarda.com/admin.html#tv=K7P4';
  assert.deepEqual(qrModules(link), qrModules(link));
  const squares = new Set(Array.from({ length: 8 }, (_, mask) => JSON.stringify(qrModules(link, { mask }))));
  assert.equal(squares.size, 8);
  for (let mask = 0; mask < 8; mask++) assert.equal(readBack(qrModules(link, { mask })).mask, mask);
});

// Reads a version 4-M square back the way a phone does, written here apart from js/qr.js: undo the mask, read the
// bits up and down in pairs of columns (skipping the fixed patterns), split the two blocks, and check each one's
// error correction and the bytes inside.
test('a version 4 square reads back as the link, with correct error correction', () => {
  const link = 'https://sistemaguarda.com/admin.html#tv=K7P4';
  const square = qrModules(link);
  const size = square.length;
  const { mask } = readBack(square);
  const masks = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0];
  const fixed = (x, y) => (x < 9 && y < 9) || (x >= size - 8 && y < 9) || (x < 9 && y >= size - 8) || x === 6 || y === 6
    || (Math.abs(x - 26) <= 2 && Math.abs(y - 26) <= 2); // version 4's one alignment pattern, at 26,26
  const bits = [];
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    const upward = ((right + 1) & 2) === 0;
    for (let i = 0; i < size; i++) {
      const y = upward ? size - 1 - i : i;
      for (const x of [right, right - 1]) if (!fixed(x, y)) bits.push(square[y][x] !== masks[mask](x, y) ? 1 : 0);
    }
  }
  const bytes = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) bytes.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));
  assert.equal(bytes.length, 100, 'version 4 holds 100 codewords');
  // Two blocks of 32 data codewords and 18 error correction codewords each, interleaved.
  const blocks = [0, 1].map(() => ({ data: [], ecc: [] }));
  for (let i = 0; i < 64; i++) blocks[i % 2].data.push(bytes[i]);
  for (let i = 64; i < 100; i++) blocks[i % 2].ecc.push(bytes[i]);
  for (const block of blocks) assert.deepEqual(errorCorrection(block.data, 18), block.ecc);
  const data = [...blocks[0].data, ...blocks[1].data];
  const stream = data.flatMap((byte) => [7, 6, 5, 4, 3, 2, 1, 0].map((bit) => (byte >>> bit) & 1));
  const number = (from, length) => stream.slice(from, from + length).reduce((value, bit) => value * 2 + bit, 0);
  assert.equal(number(0, 4), 0b0100, 'byte mode');
  const length = number(4, 8);
  assert.equal(length, link.length);
  const text = String.fromCharCode(...Array.from({ length }, (_, i) => number(12 + i * 8, 8)));
  assert.equal(text, link);
});
