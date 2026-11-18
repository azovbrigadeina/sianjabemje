/**
 * Test logika ketahanan startup/shutdown (Task 5 plan security phase 1).
 * Jalankan: node --test sianjab-db-server/resilience.test.js
 */
const test = require('node:test');
const assert = require('node:assert/strict');

process.env.HOMESERVER_SECRET = 'test-hs-secret';
process.env.API_SECRET = 'test-api-secret';
process.env.FIREBASE_SECRET = 'test-fb-secret';
process.env.SITPP_SECRET = 'test-sitpp-secret';

const { shouldPullOnStart } = require('./server.js');

test('shouldPullOnStart: pull hanya bila bersih (tanpa dirty, tanpa outbox, auto-pull aktif)', () => {
  assert.equal(shouldPullOnStart({ dirtyCount: 0, outboxCount: 0, autoPullEnv: undefined }), true);
  assert.equal(shouldPullOnStart({ dirtyCount: 0, outboxCount: 0, autoPullEnv: 'true' }), true);

  // Tulisan lokal belum flush → JANGAN pull (akan menimpa perubahan lokal)
  assert.equal(shouldPullOnStart({ dirtyCount: 3, outboxCount: 0, autoPullEnv: undefined }), false);
  assert.equal(shouldPullOnStart({ dirtyCount: 0, outboxCount: 7, autoPullEnv: undefined }), false);

  // AUTO_PULL_ON_START=false dinonaktifkan operator
  assert.equal(shouldPullOnStart({ dirtyCount: 0, outboxCount: 0, autoPullEnv: 'false' }), false);
});
