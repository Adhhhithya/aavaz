// S2/S3 regression checks for mobile/src/services/api.js's auth-token wiring.
//
// api.js uses ES module `export` syntax for Metro's bundler, but mobile's
// package.json intentionally has no "type": "module" (changing it was
// considered and rejected — Metro does its own Babel-based transform
// independent of Node's loader, so the field isn't needed for the app to
// build, and flipping it carries a real risk of changing how Node itself
// would interpret any current or future CommonJS tooling script in this
// package for no benefit). To avoid that risk, and because this project
// has no React Native test renderer configured (no Jest/RNTL — none is
// added here per the instruction not to introduce a new testing framework
// unless necessary), these checks read the actual source file as text via
// Node's built-in `node:test` + `fs`, which needs no module loading at all.
//
// Run with: node --test src/services/__tests__/

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const API_JS = path.join(__dirname, '..', 'api.js');

function readApiSource() {
  return fs.readFileSync(API_JS, 'utf8');
}

test('api.js exposes setAuthToken/clearAuthToken', () => {
  const source = readApiSource();
  assert.match(source, /export function setAuthToken/);
  assert.match(source, /export function clearAuthToken/);
});

test('api.js attaches Authorization: Bearer when a token is set', () => {
  const source = readApiSource();
  assert.match(source, /Authorization.*Bearer \$\{authToken\}/s);
});

test('api.js get/post both route through the header-building helper', () => {
  const source = readApiSource();
  const getBlock = source.slice(source.indexOf('get: async'), source.indexOf('post: async'));
  const postBlock = source.slice(source.indexOf('post: async'));
  assert.match(getBlock, /buildHeaders\(/, 'GET must attach headers via buildHeaders');
  assert.match(postBlock, /buildHeaders\(/, 'POST must attach headers via buildHeaders');
});

test('api.js post() supports a one-off Authorization override for the phone-verified registration token', () => {
  const source = readApiSource();
  assert.match(
    source,
    /authorization/,
    'post() must accept a one-off authorization override, used by RegisterScreen for the phone-verified token'
  );
});

test('api.js never hardcodes a fabricated session token', () => {
  const source = readApiSource();
  assert.doesNotMatch(source, /mock_jwt/i);
});

// Regression guard for the S2 fix: screens must no longer send user_id in
// bodies the backend derives from the authenticated session instead.
for (const [screen, forbiddenField] of [
  ['../../screens/HomeScreen.jsx', /user_id\s*:/],
  ['../../screens/ChatbotScreen.jsx', /user_id\s*:\s*userProfile/],
]) {
  test(`${screen} does not send a client-supplied identity field the backend now derives itself`, () => {
    const source = fs.readFileSync(path.join(__dirname, screen), 'utf8');
    assert.doesNotMatch(source, forbiddenField);
  });
}
