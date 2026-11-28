// The code a TV shows so a coach's phone can pair with it: 5 characters from letters and digits that can't be
// mistaken for each other (no 0/O, 1/I/L). The TV never writes to the database, so the phone can't ask whether a
// TV shows a code; instead the last two characters are a check on the first three. A code typed with one character
// wrong, or two side by side swapped, is always refused; a code typed at random still passes about 1 time in 961
// (31 × 31). Tested in tests/game-clock.test.js.
export const codeLetters = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const base = codeLetters.length; // 31, a prime: every single mistake changes the checks

const modulo = (value) => ((value % base) + base) % base;

// The two check characters for three (a, b, c): the ones that make both a + b + c + d + e and
// 1·a + 2·b + 3·c + 4·d + 5·e multiples of 31. A wrong character changes the first sum; two neighbours swapped
// change the second.
function checkLetters(first) {
  const [a, b, c] = [...first].map((letter) => codeLetters.indexOf(letter));
  const plain = a + b + c;
  const weighted = a + 2 * b + 3 * c;
  const e = modulo(4 * plain - weighted);
  const d = modulo(-plain - e);
  return codeLetters[d] + codeLetters[e];
}

// random: a function giving whole numbers from 0 to 30 (crypto in the browser; fixed in the tests).
export function newCode(random) {
  const first = Array.from({ length: 3 }, () => codeLetters[random()]).join('');
  return first + checkLetters(first);
}

export function randomLetterIndex() {
  const value = new Uint8Array(1);
  do crypto.getRandomValues(value); while (value[0] >= 248); // 248 = 8 × 31: keeps every letter equally likely
  return value[0] % base;
}

// What someone typed, as the TV shows it: capitals, no spaces; O read as 0 is not a code letter either way.
export function typedCode(typed) {
  return String(typed || '').toUpperCase().replace(/[\s-]/g, '');
}

export function isCode(code) {
  return /^[2-9A-HJKMNP-Z]{5}$/.test(code) && checkLetters(code.slice(0, 3)) === code.slice(3);
}
