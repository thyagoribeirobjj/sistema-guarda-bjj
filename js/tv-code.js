// The code a TV shows so a coach's phone can pair with it: 4 characters from letters and digits that can't be
// mistaken for each other (no 0/O, 1/I/L). The TV never writes to the database, so the phone can't ask whether a
// TV shows a code; instead the last character is a check on the first three, and a code typed with one character
// wrong, or two side by side swapped, is refused. Tested in tests/game-clock.test.js.
export const codeLetters = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const base = codeLetters.length; // 31, a prime: every single mistake changes the check

const weightedSum = (values) => values.reduce((sum, value, index) => sum + (index + 1) * value, 0);

// The check character for three: the one that makes 1·a + 2·b + 3·c + 4·check a multiple of 31.
function checkLetter(first) {
  const sum = weightedSum([...first].map((letter) => codeLetters.indexOf(letter)));
  const inverseOfFour = 8; // 4 × 8 = 32, one more than 31
  return codeLetters[(((base - (sum % base)) % base) * inverseOfFour) % base];
}

// random: a function giving whole numbers from 0 to 30 (crypto in the browser; fixed in the tests).
export function newCode(random) {
  const first = Array.from({ length: 3 }, () => codeLetters[random()]).join('');
  return first + checkLetter(first);
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
  return /^[2-9A-HJKMNP-Z]{4}$/.test(code) && checkLetter(code.slice(0, 3)) === code[3];
}
