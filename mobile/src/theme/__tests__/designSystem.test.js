const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { DS, glassCard } = require('../designSystem.js');

test('designSystem exports DS and glassCard', () => {
  assert.ok(DS, 'DS must be exported');
  assert.ok(glassCard, 'glassCard must be exported');
  assert.equal(typeof glassCard, 'object');
});

test('DS has required token structures and aliases', () => {
  // Radius and borderRadius alias
  assert.equal(DS.radius.pill, 9999);
  assert.equal(DS.radius.full, 9999);
  assert.equal(DS.borderRadius.full, 9999);
  assert.equal(DS.borderRadius.pill, 9999);

  // Typography and type alias
  assert.ok(DS.type.body);
  assert.ok(DS.typography.body);
  assert.ok(DS.type.display);
  assert.ok(DS.type.heroDisplay);

  // Canvas
  assert.ok(DS.canvas.base);
  assert.ok(DS.canvas.surface);
  assert.ok(DS.canvas.surfaceSubtle);
  assert.ok(DS.canvas.border);
  assert.ok(DS.canvas.deep);

  // Accents
  assert.ok(DS.accent.sos);
  assert.ok(DS.accent.sage);
  assert.ok(DS.accent.amber);
  assert.ok(DS.accent.terracotta);
  assert.ok(DS.accent.blue);
  assert.ok(DS.accent.crimson);
  assert.ok(DS.accent.emerald);
  assert.ok(DS.accent.indigo);
  assert.ok(DS.accent.teal);

  // Glass and Gradients
  assert.ok(DS.glass.border);
  assert.ok(DS.glass.surface);
  assert.ok(DS.gradient.background);
  assert.ok(DS.gradient.cta);
  assert.ok(DS.gradient.danger);

  // Colors compatibility object
  assert.ok(DS.colors.primary.main);
  assert.ok(DS.colors.background.surface);
  assert.ok(DS.colors.background.surfaceSubtle);
  assert.ok(DS.colors.ui.border);
  assert.ok(DS.colors.text.primary);
  assert.ok(DS.colors.text.muted);
  assert.ok(DS.colors.accent.sos);
});

test('all DS property accesses across mobile src resolve to defined values', () => {
  function getFiles(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach((file) => {
      file = path.join(dir, file);
      const stat = fs.statSync(file);
      if (stat && stat.isDirectory()) {
        if (!file.includes('node_modules') && !file.includes('__tests__')) {
          results = results.concat(getFiles(file));
        }
      } else if (file.endsWith('.js') || file.endsWith('.jsx')) {
        results.push(file);
      }
    });
    return results;
  }

  const srcDir = path.resolve(__dirname, '..', '..');
  const files = getFiles(srcDir);
  files.push(path.resolve(srcDir, '..', 'App.js'));

  const dsAccessRegex = /DS(\.[a-zA-Z0-9_]+)+/g;
  let accessCount = 0;

  files.forEach((f) => {
    const content = fs.readFileSync(f, 'utf8');
    let m;
    while ((m = dsAccessRegex.exec(content)) !== null) {
      if (m[0].endsWith('.map')) continue;
      accessCount++;
      const parts = m[0].split('.').slice(1);
      let curr = DS;
      for (const part of parts) {
        assert.ok(
          curr !== undefined && curr !== null,
          `Property path ${m[0]} in ${f} failed at segment "${part}"`
        );
        curr = curr[part];
      }
      assert.notEqual(
        curr,
        undefined,
        `Property path ${m[0]} in ${f} evaluated to undefined`
      );
    }
  });

  assert.ok(accessCount > 0, 'Must have verified at least one DS property access');
});
