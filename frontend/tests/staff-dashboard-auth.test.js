// S3 regression checks: the staff dashboard pages that make real backend
// calls must attach the staff bearer token and handle 401/403 explicitly,
// per docs/AAVAZ_IMPLEMENTATION_AUDIT.md.
//
// These are source-consistency checks, not rendered-component tests — this
// project has no React test runner (no Vitest/Jest/RTL configured, and none
// is added here per the instruction not to introduce a new testing
// framework unless necessary). Node's own built-in test runner (`node:test`,
// ships with Node, zero new dependencies) reads the actual page source as
// text and asserts the required patterns are present. This is weaker than a
// rendered/behavioral test, but it is checking the real files, not a
// rewritten copy of them, and it will fail if someone reverts the fix.
//
// Run with: node --test tests/

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = join(__dirname, '..', 'src');

function read(relativePath) {
  return readFileSync(join(SRC, relativePath), 'utf8');
}

test('AuthContext exposes authFetch and attaches a Bearer token', () => {
  const source = read('context/AuthContext.jsx');
  assert.match(source, /authFetch/, 'AuthContext must export an authFetch helper');
  assert.match(source, /Authorization.*Bearer/s, 'authFetch must attach an Authorization: Bearer header');
});

test('DistrictDashboard uses authFetch, not a bare unauthenticated fetch, for its backend call', () => {
  const source = read('pages/Admin/DistrictDashboard.jsx');
  assert.match(source, /authFetch\(/, 'DistrictDashboard must call the backend via authFetch');
  assert.doesNotMatch(
    source,
    /(?<!auth)fetch\(\s*['`]\/api\/v1/,
    'DistrictDashboard must not call a protected /api/v1 endpoint with a bare, unauthenticated fetch()'
  );
});

test('DistrictDashboard handles 401 (session invalid) and 403 (access denied) distinctly', () => {
  const source = read('pages/Admin/DistrictDashboard.jsx');
  assert.match(source, /401/, 'must check for 401');
  assert.match(source, /403/, 'must check for 403');
  assert.match(source, /logout\(\)/, '401 should trigger a client-side logout, not a silent failure');
});

test('CaseDetail uses authFetch, not a bare unauthenticated fetch, for its backend call', () => {
  const source = read('pages/Counsellor/CaseDetail.jsx');
  assert.match(source, /authFetch\(/, 'CaseDetail must call the backend via authFetch');
  assert.doesNotMatch(
    source,
    /(?<!auth)fetch\(\s*`\/api\/v1/,
    'CaseDetail must not call a protected /api/v1 endpoint with a bare, unauthenticated fetch()'
  );
});

test('CaseDetail handles 401 (session invalid) and 403 (access denied) distinctly', () => {
  const source = read('pages/Counsellor/CaseDetail.jsx');
  assert.match(source, /401/, 'must check for 401');
  assert.match(source, /403/, 'must check for 403');
  assert.match(source, /logout\(\)/, '401 should trigger a client-side logout, not a silent failure');
});

test('Login.jsx forwards the staff access_token instead of discarding it', () => {
  const source = read('pages/Login.jsx');
  assert.match(
    source,
    /login\(\{\s*\.\.\.data\.user,\s*token:\s*data\.access_token\s*\}\)/,
    'staff login must forward data.access_token into the stored session, not just data.user'
  );
});

test('Login.jsx real OTP flow: no client ever fabricates its own session token', () => {
  const source = read('pages/Login.jsx');
  assert.doesNotMatch(source, /mock_jwt/i, 'no fabricated token pattern should remain');
  assert.match(source, /\/api\/v1\/auth\/otp\/request/, 'must call the real OTP request endpoint');
  assert.match(source, /\/api\/v1\/auth\/otp\/verify/, 'must call the real OTP verify endpoint');
});

test('Pages with no real backend call (State/National dashboards, Counsellor queue) are not misrepresented as authenticated', () => {
  // These pages are mock-data-only today (confirmed by audit — no fetch call
  // exists to attach a header to). This test documents that fact so a future
  // change that adds a real fetch() to them is forced to also add authFetch,
  // by failing loudly if a bare fetch() appears without authFetch nearby.
  for (const path of ['pages/Admin/StateDashboard.jsx', 'pages/Admin/NationalDashboard.jsx', 'pages/Counsellor/Queue.jsx']) {
    const source = read(path);
    const hasBareFetch = /(?<!auth)fetch\(\s*['`]\/api\//.test(source);
    if (hasBareFetch) {
      assert.match(
        source,
        /authFetch\(/,
        `${path}: a real backend call was added without authFetch — see docs/AAVAZ_IMPLEMENTATION_AUDIT.md before wiring this page`
      );
    }
  }
});
