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

  test('searchPeople and enrichPerson stay unavailable without a key', async () => {
    const provider = new ApolloProvider({ apiKey: null });
    const search = await provider.searchPeople({ domain: 'katalys.com', titles: ['CMO'] });
    assert.equal(search.status, 'unavailable');
    assert.equal(search.fabricated, false);
    const match = await provider.enrichPerson({ fullName: 'Ada West', domain: 'katalys.com' });
    assert.equal(match.status, 'unavailable');
    assert.equal(match.fabricated, false);
  });

  test('maps official people search payloads without inventing emails', async () => {
    const provider = new ApolloProvider({
      apiKey: 'test',
      fetchImpl: async () => ({
        ok: true,
        status: 200,
        json: async () => ({
          people: [{
            id: 'abc',
            name: 'Ada West',
            title: 'VP Growth',
            organization: { name: 'Katalys', primary_domain: 'katalys.com' },
            linkedin_url: 'https://www.linkedin.com/in/ada',
            has_email: true
          }]
        })
      })
    });
    const search = await provider.searchPeople({ domain: 'katalys.com', titles: ['VP Growth'] });
    assert.equal(search.status, 'ok');
    assert.equal(search.people[0].fullName, 'Ada West');
    assert.equal(search.people[0].email, null);
    assert.equal(search.people[0].phone, null);
    assert.equal(search.fabricated, false);
  });
});
