import { describe, expect, it } from 'vitest';
import request from 'supertest';
import handler from '../api/index.js';

describe('Vercel Express entry point', () => {
  it('imports the application and serves the health endpoint under /api/v1', async () => {
    const response = await request(handler).get('/api/v1/health');

    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      success: true,
      data: { status: 'ok' },
    });
    expect(response.headers['x-request-id']).toBeTruthy();
  });

  it('preserves authentication on protected API routes', async () => {
    const response = await request(handler).get('/api/v1/dashboard/overview');

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('MISSING_TOKEN');
  });
});
