import { archiveWeek, saveWeek, translate } from './firebase.js';
import { t } from './strings.js';
import { translatedFields } from './translation.js';
import { localDate, switchOver, worthArchiving } from './week.js';

// The admin page's saving steps that keep nothing of their own (js/admin-week.js runs them).

// Once a prepared week's start date has come, it becomes this week and the old class moves to past weeks.
// Students already see it by the date; this makes the database match. If filing the old class fails, nothing
// changes, so no class is lost. Returns the new site/week, false if it failed, or null when there was nothing to do.
export async function startPreparedWeek(stored) {
  const change = switchOver(stored, localDate());
  if (!change) return null;
  try {
    if (change.archive) await archiveWeek(change.archive);
    await saveWeek(change.week);
    return change.week;
  } catch (error) {
    console.error(error);
    return false;
  }
}

// Carries out the plan. If the translator fails, the fields it should have filled are left empty, so the site
// shows the original text rather than an old translation of different words.
export async function fillTranslations(draft, plan, from, to) {
  translatedFields.filter((name) => plan[name] === 'clear').forEach((name) => { draft[name][to] = ''; });
  const needed = translatedFields.filter((name) => plan[name] === 'translate');
  if (!needed.length) return true;
  document.getElementById('status').textContent = t('translating');
  try {
    const texts = await translate(needed.map((name) => draft[name][from]), from, to);
    needed.forEach((name, i) => { draft[name][to] = texts[i]; });
    return true;
  } catch (error) {
    console.error(error);
    needed.forEach((name) => { draft[name][to] = ''; });
    return false;
  }
}

// A new class moves the live one into "Past weeks". Saving goes ahead if only the archiving fails.
export async function archiveIfNew(previous, draft) {
  if (!worthArchiving(previous, draft)) return true;
  try {
    await archiveWeek(previous);
    return true;
  } catch (error) {
    console.error(error);
    return false;
  }
}
