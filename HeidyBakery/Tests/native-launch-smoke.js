// Run through Tests/run-native-smoke.cjs; expectedVersion comes from source Info.plist.
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

check(document.querySelector('#app-version')?.textContent === expectedVersion, 'Wrong app version');
check(document.querySelectorAll('#app-nav [data-tab]').length === 6, 'Navigation is incomplete');
check(!document.querySelector('#dialog')?.open, 'Unexpected dialog');
check(document.querySelector('#save-status')?.textContent !== 'Opening your bakery…', 'App did not finish opening');

return 'PASS: native app launched, initialized an isolated library, opened all six screens, and reported '+expectedVersion+'. Signing/notarization is not tested here.';
