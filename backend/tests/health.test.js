import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import app from '../src/app.js';

describe('Health & Readiness Endpoints', () => {
  test('GET / returns API info', async () => {
    const res = await request(app).get('/');
    assert.equal(res.status, 200);
    assert.equal(res.body.name, 'Personalized AI Journal API');
  });

  test('GET /api/health returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ok');
    assert.ok(res.body.timestamp);
    assert.ok(typeof res.body.uptimeSeconds === 'number');
  });

  test('GET /api/ready returns 200 with ready state', async () => {
    const res = await request(app).get('/api/ready');
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'ready');
    assert.equal(res.body.checks.server, 'healthy');
  });

  test('GET /api/nonexistent-route returns 404 with standard error format', async () => {
    const res = await request(app).get('/api/nonexistent-route');
    assert.equal(res.status, 404);
    assert.equal(res.body.error.code, 'NOT_FOUND');
    assert.ok(res.body.error.message.includes('not found'));
  });
});
