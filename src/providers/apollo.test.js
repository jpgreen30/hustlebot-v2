import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { ApolloProvider } from './apollo.js';

describe('ApolloProvider', () => {
  test('is UNAVAILABLE without credentials and never fabricates', async () => {
    const provider = new ApolloProvider({ apiKey: null });
    assert.equal(provider.isAvailable(), false);
    const out = await provider.enrich({ domain: 'katalys.com' });
    assert.equal(out.status, 'unavailable');
    assert.match(out.reason, /APOLLO_API_KEY/);
    assert.equal(out.fabricated, false);
  });
});
