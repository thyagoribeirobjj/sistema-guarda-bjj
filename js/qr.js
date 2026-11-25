// A small QR code maker, for the TV's pairing square (an address to open on the phone). Byte mode, error correction
// level M, versions 1 to 10 (up to 213 characters): plenty for a link. It follows the QR standard (ISO/IEC 18004)
// step by step; tests/qr.test.js checks it against the standard's worked examples.
// qrModules(text) gives the square as rows of true (dark) and false (light), without the quiet border around it.

// Error correction codewords per block, and blocks, for level M, versions 1 to 10 (index 0 unused).
const eccPerBlock = [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26];
const blockCount = [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5];
const levelM = 0; // the two bits the format information uses for level M

// ---- Reed-Solomon over GF(256), as the standard defines it (x^8 + x^4 + x^3 + x^2 + 1) ----
function multiply(a, b) {
  let product = 0;
  for (let bit = 7; bit >= 0; bit--) {
    product = (product << 1) ^ ((product >>> 7) * 0x11d);
    product ^= ((b >>> bit) & 1) * a;
  }
  return product;
}

function divisor(degree) {
  const result = new Array(degree).fill(0);
  result[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < degree; j++) {
      result[j] = multiply(result[j], root);
      if (j + 1 < degree) result[j] ^= result[j + 1];
    }
    root = multiply(root, 0x02);
  }
  return result;
}

export function errorCorrection(data, degree) {
  const generator = divisor(degree);
  const result = new Array(degree).fill(0);
  for (const byte of data) {
    const factor = byte ^ result.shift();
    result.push(0);
    generator.forEach((coefficient, i) => { result[i] ^= multiply(coefficient, factor); });
  }
  return result;
}

// ---- sizes ----
const sizeOf = (version) => version * 4 + 17;

function rawModules(version) {
  let result = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const align = Math.floor(version / 7) + 2;
    result -= (25 * align - 10) * align - 55;
    if (version >= 7) result -= 36;
  }
  return result;
}

const dataCodewords = (version) => Math.floor(rawModules(version) / 8) - eccPerBlock[version] * blockCount[version];

function alignmentPositions(version) {
  if (version === 1) return [];
  const count = Math.floor(version / 7) + 2;
  const step = Math.ceil((version * 4 + 4) / (count * 2 - 2)) * 2;
  const result = [6];
  for (let position = sizeOf(version) - 7; result.length < count; position -= step) result.splice(1, 0, position);
  return result;
}

// ---- the data: mode, length, bytes, padding, then error correction, interleaved ----
function codewords(bytes, version) {
  const bits = [];
  const put = (value, length) => { for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, version < 10 ? 8 : 16);
  bytes.forEach((byte) => put(byte, 8));
  const capacity = dataCodewords(version) * 8;
  put(0, Math.min(4, capacity - bits.length));
  put(0, (8 - (bits.length % 8)) % 8);
  for (let pad = 0xec; bits.length < capacity; pad ^= 0xec ^ 0x11) put(pad, 8);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((byte, bit) => (byte << 1) | bit, 0));

  const blocks = blockCount[version];
  const ecc = eccPerBlock[version];
  const raw = Math.floor(rawModules(version) / 8);
  const shortBlocks = blocks - (raw % blocks);
  const shortLength = Math.floor(raw / blocks);
  const split = [];
  for (let i = 0, at = 0; i < blocks; i++) {
    const length = shortLength - ecc + (i < shortBlocks ? 0 : 1);
    const block = data.slice(at, at + length);
    at += length;
    split.push({ data: block, ecc: errorCorrection(block, ecc) });
  }
  const result = [];
  for (let i = 0; i < shortLength - ecc + 1; i++) split.forEach((block) => { if (i < block.data.length) result.push(block.data[i]); });
  for (let i = 0; i < ecc; i++) split.forEach((block) => result.push(block.ecc[i]));
  return result;
}

// ---- format and version information ----
export function formatBits(level, mask) {
  const data = (level << 3) | mask;
  let remainder = data;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  return ((data << 10) | remainder) ^ 0x5412;
}

export function versionBits(version) {
  let remainder = version;
  for (let i = 0; i < 12; i++) remainder = (remainder << 1) ^ ((remainder >>> 11) * 0x1f25);
  return (version << 12) | remainder;
}

// ---- the square ----
class Square {
  constructor(version) {
    this.size = sizeOf(version);
    this.dark = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
    this.fixed = Array.from({ length: this.size }, () => new Array(this.size).fill(false));
  }

  set(x, y, dark) {
    this.dark[y][x] = dark;
    this.fixed[y][x] = true;
  }

  finder(cx, cy) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        const ring = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < this.size && y >= 0 && y < this.size) this.set(x, y, ring !== 2 && ring !== 4);
      }
    }
  }

  alignment(cx, cy) {
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) this.set(cx + dx, cy + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }

  patterns(version) {
    for (let i = 0; i < this.size; i++) {
      this.set(6, i, i % 2 === 0);
      this.set(i, 6, i % 2 === 0);
    }
    this.finder(3, 3);
    this.finder(this.size - 4, 3);
    this.finder(3, this.size - 4);
    const positions = alignmentPositions(version);
    const last = positions.length - 1;
    positions.forEach((x, i) => positions.forEach((y, j) => {
      const corner = (i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0);
      if (!corner) this.alignment(x, y);
    }));
    this.format(0);
    if (version >= 7) {
      const bits = versionBits(version);
      for (let i = 0; i < 18; i++) {
        const dark = ((bits >>> i) & 1) === 1;
        const a = this.size - 11 + (i % 3);
        const b = Math.floor(i / 3);
        this.set(a, b, dark);
        this.set(b, a, dark);
      }
    }
  }

  format(mask) {
    const bits = formatBits(levelM, mask);
    const bit = (i) => ((bits >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) this.set(8, i, bit(i));
    this.set(8, 7, bit(6));
    this.set(8, 8, bit(7));
    this.set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) this.set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) this.set(this.size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) this.set(8, this.size - 15 + i, bit(i));
    this.set(8, this.size - 8, true);
  }

  place(data) {
    let i = 0;
    for (let right = this.size - 1; right >= 1; right -= 2) {
      if (right === 6) right = 5;
      for (let vertical = 0; vertical < this.size; vertical++) {
        for (let j = 0; j < 2; j++) {
          const x = right - j;
          const upward = ((right + 1) & 2) === 0;
          const y = upward ? this.size - 1 - vertical : vertical;
          if (!this.fixed[y][x] && i < data.length * 8) {
            this.dark[y][x] = ((data[i >>> 3] >>> (7 - (i & 7))) & 1) === 1;
            i++;
          }
        }
      }
    }
  }

  applyMask(mask) {
    const rules = [
      (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
      (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
      (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
    ];
    for (let y = 0; y < this.size; y++) for (let x = 0; x < this.size; x++) if (!this.fixed[y][x] && rules[mask](x, y)) this.dark[y][x] = !this.dark[y][x];
  }

  // The standard's four penalties; the mask with the lowest is used, so phones read the square easily.
  penalty() {
    let score = 0;
    const lines = [...this.dark, ...this.dark.map((_, x) => this.dark.map((row) => row[x]))];
    for (const line of lines) {
      let run = 1;
      for (let i = 1; i <= line.length; i++) {
        if (i < line.length && line[i] === line[i - 1]) run++;
        else {
          if (run >= 5) score += run - 2;
          run = 1;
        }
      }
      const pattern = line.map((dark) => (dark ? '1' : '0')).join('');
      score += 40 * ((pattern.match(/(?=10111010000|00001011101)/g) || []).length);
    }
    for (let y = 0; y + 1 < this.size; y++) {
      for (let x = 0; x + 1 < this.size; x++) {
        const colour = this.dark[y][x];
        if (colour === this.dark[y][x + 1] && colour === this.dark[y + 1][x] && colour === this.dark[y + 1][x + 1]) score += 3;
      }
    }
    const dark = this.dark.flat().filter(Boolean).length;
    const total = this.size * this.size;
    score += (Math.ceil(Math.abs(dark * 20 - total * 10) / total) - 1) * 10;
    return score;
  }
}

export function qrModules(text, { mask: forcedMask } = {}) {
  const bytes = [...new TextEncoder().encode(text)];
  let version = 1;
  while (version <= 10 && 4 + (version < 10 ? 8 : 16) + bytes.length * 8 > dataCodewords(version) * 8) version++;
  if (version > 10) throw new Error('Too long for this QR code maker.');
  const square = new Square(version);
  square.patterns(version);
  square.place(codewords(bytes, version));
  let best = forcedMask ?? 0;
  if (forcedMask === undefined) {
    let lowest = Infinity;
    for (let mask = 0; mask < 8; mask++) {
      square.applyMask(mask);
      square.format(mask);
      const score = square.penalty();
      if (score < lowest) [lowest, best] = [score, mask];
      square.applyMask(mask);
    }
  }
  square.applyMask(best);
  square.format(best);
  return square.dark;
}
