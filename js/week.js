// Which class is "this week" on a given day, and what the admin page writes when a prepared week starts.
// No page, no database: tests/week.test.js.
// site/week holds this week's class and, once an admin prepares it, next: the class that takes over on next.weekOf.
// Every visitor's browser decides by its own date, so students see the new class on the day; the database itself
// is switched (the old class filed under past weeks) the next time an admin opens or saves the admin page.
// Dates are 'YYYY-MM-DD' text, so comparing them as text compares the days.
export const classFields = ['weekOf', 'title', 'note', 'techniques', 'from', 'handFixed', 'written'];

// Today in this browser's own time zone, as 'YYYY-MM-DD'.
export function localDate(date = new Date()) {
  const pad = (number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// The Monday after the given day, as 'YYYY-MM-DD': where a prepared week starts unless the admin picks another day.
export function nextMonday(today) {
  const [year, month, day] = today.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  date.setDate(date.getDate() + (((8 - date.getDay()) % 7) || 7));
  return localDate(date);
}

// Past weeks are told apart by their date, so two classes must never share one: a prepared week starts after today
// and after this week's date, and this week's date stays before the prepared week's start.
// Returns '' when the date is fine, or the message key that says why not.
export function dateProblem(which, weekOf, { today, thisWeekOf = '', nextWeekOf = '' }) {
  if (which === 'next') return weekOf > today && weekOf > thisWeekOf ? '' : 'startAfterToday';
  return nextWeekOf && !(weekOf < nextWeekOf) ? 'beforeNextWeek' : '';
}

// Where a new prepared week starts unless the admin picks another day: the Monday after today, or after this week's
// date when the admin dated this week ahead.
export function firstStart(today, thisWeekOf = '') {
  return nextMonday(thisWeekOf > today ? thisWeekOf : today);
}

// Just the class: no `next`, no who-saved-it-when.
export function classOf(week) {
  if (!week) return {};
  return Object.fromEntries(classFields.filter((name) => week[name] !== undefined).map((name) => [name, week[name]]));
}

function hasClass(week) {
  return Boolean(week && (week.weekOf || week.techniques?.length || week.title?.pt || week.title?.en));
}

// stored: site/week as read. Returns the class to show as this week (null when there is none) and, once the
// prepared week has started, the class it replaced (previous), which shows as the newest past week.
export function weekOn(stored, today) {
  const current = hasClass(stored) ? classOf(stored) : null;
  const next = stored?.next;
  if (next?.weekOf && today >= next.weekOf) return { week: classOf(next), previous: current };
  return { week: current, previous: null };
}

// Past weeks keep only what the page shows, plus how its text was written, so it can be reused on the admin page.
export function pastEntry(week) {
  const entry = { weekOf: week.weekOf, title: week.title || {}, note: week.note || {}, techniques: week.techniques || [] };
  for (const name of ['from', 'handFixed', 'written']) if (week[name] !== undefined) entry[name] = week[name];
  return entry;
}

// A new class moves the old one into past weeks. Not when there was no old class, when only the date was
// corrected, or when it is the same class again.
export function worthArchiving(previous, next) {
  if (!previous?.weekOf || previous.weekOf === next.weekOf) return false;
  const hasContent = previous.techniques?.length || previous.title?.pt || previous.title?.en;
  const sameClass = JSON.stringify(previous.techniques || []) === JSON.stringify(next.techniques || [])
    && previous.title?.pt === next.title?.pt && previous.title?.en === next.title?.en;
  return Boolean(hasContent) && !sameClass;
}

// What the admin page writes once the prepared week has started: the new site/week (no `next` left) and the
// past week to file (null when there is none worth keeping). null when there is nothing to switch.
export function switchOver(stored, today) {
  const next = stored?.next;
  if (!next?.weekOf || today < next.weekOf) return null;
  const old = hasClass(stored) ? classOf(stored) : null;
  const week = classOf(next);
  return { week, archive: old && worthArchiving(old, week) ? pastEntry(old) : null };
}

// The past weeks a student sees: the class the prepared week just replaced first (until an admin's visit files it),
// then the saved ones, never this week itself and never the same week twice.
export function pastWeeksShown(saved, week, previous) {
  const weeks = previous && !saved.some((past) => past.weekOf === previous.weekOf) ? [previous, ...saved] : saved;
  return weeks.filter((past) => past.weekOf !== week?.weekOf);
}
