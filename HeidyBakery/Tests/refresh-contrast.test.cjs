// Verify functional token pairings directly from the shipped stylesheet.
// Checks the light (:root) and dark (@media prefers-color-scheme:dark)
// palettes actually defined in Resources/style.css.
const fs = require('node:fs'), assert = require('node:assert/strict');
const css = fs.readFileSync(require.resolve('../Resources/style.css'), 'utf8');

function luminance(hex) {
  return hex.slice(1).match(/../g).map(x => parseInt(x, 16) / 255)
    .map(x => x <= .04045 ? x / 12.92 : ((x + .055) / 1.055) ** 2.4)
    .reduce((sum, x, i) => sum + x * [.2126, .7152, .0722][i], 0);
}
function ratio(a, b) {
  const [lo, hi] = [luminance(a), luminance(b)].sort((a, b) => a - b);
  return (hi + .05) / (lo + .05);
}

// Light palette lives in the top-level :root block; dark palette lives in
// the :root block nested inside @media(prefers-color-scheme:dark). Light
// values not overridden there (e.g. --line) are inherited, so start dark
// from a copy of light and apply only the overridden keys.
const rootBlocks = [...css.matchAll(/:root\{([^}]+)\}/g)].map(m => m[1]);
assert.equal(rootBlocks.length, 2, `expected exactly 2 :root blocks (light + dark), found ${rootBlocks.length}`);

function extractVars(block) {
  return Object.fromEntries([...block.matchAll(/--([\w-]+):\s*(#[0-9a-f]{6})/g)].map(x => [x[1], x[2]]));
}
const light = extractVars(rootBlocks[0]);
const dark = { ...light, ...extractVars(rootBlocks[1]) };

for (const key of ['paper', 'wash', 'ink', 'brand', 'bad', 'green']) {
  assert.ok(light[key], `light palette missing --${key}`);
  assert.ok(dark[key], `dark palette missing --${key}`);
}

let count = 0;
for (const [name, p] of [['light', light], ['dark', dark]]) {
  for (const background of ['paper', 'wash']) {
    for (const foreground of ['ink', 'brand', 'bad', 'green']) {
      const r = ratio(p[foreground], p[background]);
      assert.ok(r >= 4.5, `${name}: ${foreground}/${background} is ${r.toFixed(2)}, below 4.5`);
      count++;
    }
  }
  // brand used as an active/focus border and control accent - UI-component threshold
  const borderRatio = ratio(p.brand, p.paper);
  assert.ok(borderRatio >= 3, `${name}: brand/paper border contrast ${borderRatio.toFixed(2)}, below 3`);
  count++;
}

// button.primary text-on-brand: light mode uses a hardcoded white; dark
// mode overrides it to a dark espresso tone. Verify both explicitly since
// they are not custom properties.
const lightOnBrand = ratio('#ffffff', light.brand);
assert.ok(lightOnBrand >= 4.5, `light button.primary white-on-brand is ${lightOnBrand.toFixed(2)}, below 4.5`);
count++;

const darkButtonMatch = css.match(/@media\(prefers-color-scheme:dark\)\{[\s\S]*?button\.primary\{color:(#[0-9a-f]{6})\}/);
assert.ok(darkButtonMatch, 'expected a dark-mode button.primary color override');
const darkOnBrand = ratio(darkButtonMatch[1], dark.brand);
assert.ok(darkOnBrand >= 4.5, `dark button.primary text-on-brand is ${darkOnBrand.toFixed(2)}, below 4.5`);
count++;

console.log(`Refresh contrast passed: ${count} light/dark functional pairings; normal text >=4.5:1, brand border >=3:1.`);
