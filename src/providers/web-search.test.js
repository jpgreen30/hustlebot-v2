import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { WebSearchProvider } from './web-search.js';

function htmlResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
    json: async () => JSON.parse(body)
  };
}

describe('WebSearchProvider fallbacks', () => {
  test('treats DuckDuckGo HTML challenge as failure and uses lite results', async () => {
    const calls = [];
    const fetchImpl = async (url) => {
      calls.push(String(url));
      if (String(url).includes('html.duckduckgo.com')) {
        return htmlResponse(202, '<html>anomaly-modal challenge detecting unusual traffic</html>');
      }
      if (String(url).includes('lite.duckduckgo.com')) {
        return htmlResponse(200, `
          <table>
            <tr class="result-sponsored"><td><a class="result-link" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fads.example">Ad</a></td></tr>
            <tr><td><a class="result-link" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fwww.yellowpages.com%2Flos-angeles-ca%2Froofing-contractors">YP Roofing</a></td></tr>
            <tr><td class="result-snippet">Public directory of roofers</td></tr>
          </table>
        `);
      }
      throw new Error(`unexpected url ${url}`);
    };
    const search = new WebSearchProvider({ fetchImpl });
    const out = await search.search('Los Angeles roofing companies', { limit: 5 });
    assert.equal(out.status, 'ok');
    assert.equal(out.provider, 'duckduckgo-lite');
    assert.equal(out.results[0].url, 'https://www.yellowpages.com/los-angeles-ca/roofing-contractors');
    assert.ok(calls.some((u) => u.includes('html.duckduckgo.com')));
    assert.ok(calls.some((u) => u.includes('lite.duckduckgo.com')));
  });

  test('falls through to Bing cites when DuckDuckGo is empty', async () => {
    const fetchImpl = async (url) => {
      if (String(url).includes('duckduckgo.com')) {
        return htmlResponse(200, '<html><body>no results here</body></html>');
      }
      if (String(url).includes('bing.com')) {
        return htmlResponse(200, `
          <ol id="b_results">
            <li class="b_algo"><h2>Yellow Pages Roofing</h2><cite>https://www.yellowpages.com › los-angeles-ca › roofing</cite><p>Contractors</p></li>
          </ol>
        `);
      }
      throw new Error(`unexpected url ${url}`);
    };
    const search = new WebSearchProvider({ fetchImpl });
    const out = await search.search('Los Angeles roofing companies');
    assert.equal(out.status, 'ok');
    assert.equal(out.provider, 'bing');
    assert.equal(out.results[0].url, 'https://www.yellowpages.com/los-angeles-ca/roofing');
  });
});
