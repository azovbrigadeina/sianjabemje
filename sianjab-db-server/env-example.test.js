const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');

function readEnvKeys(file) {
  const text = fs.readFileSync(path.join(root, file), 'utf8');
  return new Set(
    text.split('\n')
      .map((l) => l.trim().replace(/^#\s*/, ''))
      .filter((l) => /^[A-Z0-9_]+\s*=/.test(l))
      .map((l) => l.split('=')[0].trim())
  );
}

test('semua env yang dibaca server.js ada di .env.example', () => {
  const src = fs.readFileSync(path.join(root, 'sianjab-db-server/server.js'), 'utf8');
  const used = new Set();
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) used.add(m[1]);
  for (const m of src.matchAll(/requireEnv\('([A-Z0-9_]+)'\)/g)) used.add(m[1]);
  const documented = readEnvKeys('sianjab-db-server/.env.example');
  const missing = [...used].filter((k) => !documented.has(k)).sort();
  assert.deepEqual(missing, []);
});

test('semua NEXT_PUBLIC_* yang dibaca src ada di .env.local.example', () => {
  const files = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(e.name)) files.push(p);
    }
  };
  walk(path.join(root, 'src'));
  const used = new Set();
  for (const f of files) {
    const text = fs.readFileSync(f, 'utf8');
    for (const m of text.matchAll(/process\.env\.(NEXT_PUBLIC_[A-Z0-9_]+)/g)) used.add(m[1]);
  }
  const documented = readEnvKeys('.env.local.example');
  const missing = [...used].filter((k) => !documented.has(k)).sort();
  assert.deepEqual(missing, []);
});

test('.gitignore mengizinkan .env.local.example', () => {
  const gi = fs.readFileSync(path.join(root, '.gitignore'), 'utf8');
  assert.match(gi, /^!\.env\.local\.example$/m);
});
