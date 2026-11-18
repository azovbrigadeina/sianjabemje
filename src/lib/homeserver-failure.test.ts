import test from 'node:test';
import assert from 'node:assert/strict';
import { isHomeserverNetworkFailure } from './homeserver-failure.ts';

test('502/503/504 dari funnel dianggap gangguan jaringan', () => {
  assert.equal(isHomeserverNetworkFailure(502, 'Bad Gateway'), true);
  assert.equal(isHomeserverNetworkFailure(503, 'Service Unavailable'), true);
  assert.equal(isHomeserverNetworkFailure(504, 'Gateway Timeout'), true);
});

test('fetch gagal total (status 0) dianggap gangguan jaringan', () => {
  assert.equal(isHomeserverNetworkFailure(0, 'Failed to fetch'), true);
  assert.equal(isHomeserverNetworkFailure(0, ''), true);
});

test('error bisnis 4xx tidak dianggap gangguan jaringan', () => {
  assert.equal(isHomeserverNetworkFailure(400, 'Username atau password salah'), false);
  assert.equal(isHomeserverNetworkFailure(401, 'Token tidak valid'), false);
  assert.equal(isHomeserverNetworkFailure(403, 'Forbidden'), false);
  assert.equal(isHomeserverNetworkFailure(429, 'Terlalu banyak percobaan'), false);
});

test('pesan jaringan tanpa status tetap dikenali', () => {
  assert.equal(isHomeserverNetworkFailure(200, 'Failed to fetch'), true);
  assert.equal(isHomeserverNetworkFailure(200, 'Homeserver sedang OFF'), true);
  assert.equal(isHomeserverNetworkFailure(200, 'Load failed'), true);
});
