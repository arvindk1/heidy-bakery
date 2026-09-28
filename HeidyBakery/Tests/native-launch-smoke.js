// Runs inside the shipping WKWebView with an isolated empty library.
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(test, label) {
  for (let n = 0; n < 300; n++) {
    if (test()) return;
    await pause(100);
  }
  throw Error('Timed out: ' + label);
}
function check(value, label) { if (!value) throw Error(label); }

await until(() => document.querySelector('#import-seed'), 'welcome screen');
document.querySelector('#import-seed').click();
await until(() => document.querySelector('#new-recipe'), 'price list');

const expected = {
  prices: 'Price list',
  recipes: 'Recipes',
  ingredients: 'Ingredients',
  receipts: 'Receipts',
  'margin-watch': 'Margin Watch',
  settings: 'Settings',
};
for (const [tab, heading] of Object.entries(expected)) {
  document.querySelector(`[data-tab="${tab}"]`).click();
  await until(() => document.querySelector('#main h1')?.textContent === heading, heading);
}

// Checks the version line's shape, not an exact number — an exact match goes
// stale every release (this one still expected 0.3.8 · Build 11 after two
// version bumps).
const versionText = document.querySelector('#app-version')?.textContent || '';
const versionMatch = /^Version (\d+\.\d+\.\d+) · Build (\d+)$/.exec(versionText);
check(versionMatch, 'Wrong app version: ' + JSON.stringify(versionText));
check(document.querySelectorAll('#app-nav [data-tab]').length === 6, 'Navigation is incomplete');
check(!document.querySelector('#dialog')?.open, 'Unexpected dialog');
check(document.querySelector('#save-status')?.textContent !== 'Opening your bakery…', 'App did not finish opening');

return `PASS: notarized native app launched, initialized an isolated library, opened all six screens, and reported version ${versionMatch[1]} build ${versionMatch[2]}.`;
