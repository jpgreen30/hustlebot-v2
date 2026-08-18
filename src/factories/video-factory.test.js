import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { VideoFactory } from './video-factory.js';

describe('HeyGen contract', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.HEYGEN_API_KEY = 'heygen-test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    delete process.env.HEYGEN_API_KEY;
    delete process.env.HEYGENAPI_KEY;
  });

  test('uses X-Api-Key and v3 video-agents, never fabricates ids', async () => {
    const calls = [];
    global.fetch = async (url, options) => {
      calls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        json: async () => ({ data: { session_id: 'sess_abc123', status: 'generating', video_id: null } })
      };
    };

    const factory = new VideoFactory();
    const result = await factory.createVideo({
      script: 'HustleBot is online.',
      topic: 'day1'
    });

    assert.equal(result.session_id, 'sess_abc123');
    assert.equal(result.id, 'sess_abc123');
    assert.ok(!String(result.id).startsWith('video-'));
    const create = calls.find((c) => c.url.endsWith('/v3/video-agents'));
    assert.ok(create);
    assert.equal(create.options.headers['X-Api-Key'], 'heygen-test-key');
    assert.ok(!create.options.headers.Authorization);
    const body = JSON.parse(create.options.body);
    assert.match(body.prompt, /HustleBot is online/);
  });

  test('rejects a provider response with no id', async () => {
    global.fetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ data: { status: 'generating' } })
    });
    const factory = new VideoFactory();
    const result = await factory.createVideo('HustleBot is online.');
    assert.equal(result.status, 'failed');
    assert.match(result.error, /protocol violation/);
  });

  test('returns unavailable instead of a mock video when unconfigured', async () => {
    delete process.env.HEYGEN_API_KEY;
    const factory = new VideoFactory();
    const result = await factory.createVideo({ script: 'hi' });
    assert.equal(result.status, 'unavailable');
    assert.ok(!result.id);
  });
});
