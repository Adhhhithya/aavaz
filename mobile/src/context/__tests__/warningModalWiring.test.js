const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT_DIR = path.resolve(__dirname, '..', '..', '..');
const WARNING_CONTEXT_PATH = path.join(ROOT_DIR, 'src', 'context', 'WarningModalContext.jsx');
const APP_PATH = path.join(ROOT_DIR, 'App.js');
const SCREENS_DIR = path.join(ROOT_DIR, 'src', 'screens');

function readWarningContextSource() {
  return fs.readFileSync(WARNING_CONTEXT_PATH, 'utf8');
}

function readAppSource() {
  return fs.readFileSync(APP_PATH, 'utf8');
}

test('WarningModalContext exports formatErrorMessage and provider functions', () => {
  const source = readWarningContextSource();
  assert.match(source, /export function formatErrorMessage/);
  assert.match(source, /export function WarningModalProvider/);
  assert.match(source, /export function useWarningModal/);
  assert.match(source, /export function showGlobalWarningModal/);
});

test('WarningModalContext intercepts Alert.alert and window/global alerts', () => {
  const source = readWarningContextSource();
  assert.match(source, /Alert\.alert\s*=/);
  assert.match(source, /window\.alert\s*=/);
  assert.match(source, /global\.alert\s*=/);
  assert.match(source, /global\.onunhandledrejection\s*=/);
});

test('App.js is hardened against crashes and raw red screens', () => {
  const source = readAppSource();
  // Must wrap in ErrorBoundary and WarningModalProvider
  assert.match(source, /<ErrorBoundary/);
  assert.match(source, /<WarningModalProvider>/);
  // Must suppress dev log box overlay
  assert.match(source, /LogBox\.ignoreAllLogs\(true\)/);
  // Must install global exception and rejection handlers
  assert.match(source, /ErrorUtils\.setGlobalHandler/);
  assert.match(source, /global\.onunhandledrejection/);
});

test('No screen uses Alert.prompt which crashes on Android', () => {
  const screenFiles = fs.readdirSync(SCREENS_DIR).filter((f) => f.endsWith('.js') || f.endsWith('.jsx'));
  for (const file of screenFiles) {
    const full = path.join(SCREENS_DIR, file);
    const content = fs.readFileSync(full, 'utf8');
    assert.doesNotMatch(
      content,
      /Alert\.prompt\(/,
      `Screen ${file} must not use iOS-only Alert.prompt() because it crashes on Android`
    );
  }
});

test('Screens do not use raw alert()', () => {
  const screenFiles = fs.readdirSync(SCREENS_DIR).filter((f) => f.endsWith('.js') || f.endsWith('.jsx'));
  for (const file of screenFiles) {
    const full = path.join(SCREENS_DIR, file);
    const content = fs.readFileSync(full, 'utf8');
    // Match standalone alert(...) not Alert.alert
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
      // ignore comments
      const trimmed = line.trim();
      if (trimmed.startsWith('//') || trimmed.startsWith('*')) return;
      assert.doesNotMatch(
        trimmed,
        /(?<![a-zA-Z0-9_\.])alert\s*\(/,
        `Line ${idx + 1} in ${file} must use WarningModal instead of raw alert()`
      );
    });
  }
});

const { formatErrorMessage } = require('../../utils/formatErrorMessage');

test('formatErrorMessage handles various error shapes', () => {
  // 401
  assert.equal(
    formatErrorMessage('API Error: 401'),
    'Invalid or expired verification code. Please check your SMS and try again.'
  );

  // 404
  assert.equal(
    formatErrorMessage(new Error('API Error: 404')),
    'The requested service is momentarily unavailable. Please check your connection.'
  );

  // 500
  assert.equal(
    formatErrorMessage('500 Internal Server Error'),
    'Our support server is experiencing a momentary delay. Please try again in a few moments.'
  );

  // Network error
  assert.equal(
    formatErrorMessage(new Error('Network request failed')),
    'Unable to reach the support server. Please check your internet connection and try again.'
  );

  // FastAPI structured error detail array
  assert.equal(
    formatErrorMessage({ data: { detail: [{ msg: 'Field required' }, { msg: 'Invalid phone format' }] } }),
    'Field required; Invalid phone format'
  );

  // Plain custom message
  assert.equal(
    formatErrorMessage('Trial accounts can only make calls to verified phone numbers.'),
    'Trial accounts can only make calls to verified phone numbers.'
  );

  // Null or empty
  assert.equal(
    formatErrorMessage(null),
    'An unexpected condition occurred. Your data is safe.'
  );
});
