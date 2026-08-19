/**
 * Exercise the shared production processNaturalLanguage path
 * (Intent hint → ActionBridge → acquisition.run) without Telegram.
 */
import { CapabilityRegistry } from '../src/core/capability-registry.js';
import { registerPlatformCapabilities } from '../src/core/platform-capabilities.js';
import { registerAcquisitionCapabilities } from '../src/acquisition/register.js';
import { IntentDetector } from '../src/core/intent-detector.js';
import { ActionBridge } from '../src/core/action-bridge.js';
import { AcquisitionEngine } from '../src/acquisition/engine.js';
import { AcquisitionStore } from '../src/acquisition/store.js';
import { CustomSpider } from '../src/providers/spider.js';
import { FirecrawlProvider } from '../src/providers/firecrawl.js';
import { WebSearchProvider } from '../src/providers/web-search.js';
import { ProspectEnricher } from '../src/acquisition/enrich.js';
import { N8NIntegration } from '../src/integrations/n8n-integration.js';

const spider = new CustomSpider();
const firecrawl = new FirecrawlProvider();
const search = new WebSearchProvider();
const store = new AcquisitionStore();
const enricher = new ProspectEnricher({ scraper: spider });
const n8n = new N8NIntegration();
const engine = new AcquisitionEngine({ firecrawl, spider, search, store, enricher, n8n });

const registry = new CapabilityRegistry();
registerPlatformCapabilities(registry, {});
registerAcquisitionCapabilities(registry, {
  firecrawlProvider: firecrawl,
  spiderProvider: spider,
  webSearchProvider: search,
  acquisitionEngine: engine,
  acquisitionStore: store,
  prospectEnricher: enricher
});

const detector = new IntentDetector({ llm: null, registry });
const bridge = new ActionBridge({ registry });

const text = process.argv.slice(2).join(' ') ||
  'Find exhibitors from https://en.wikipedia.org/wiki/Category:Online_advertising_services_and_affiliate_networks and build me a prospect list';

const intent = await detector.detect(text);
console.log('INTENT', JSON.stringify({ capabilityId: intent.capabilityId, confidence: intent.confidence, parameters: intent.parameters }));
const result = await bridge.execute(intent, { userId: 'local-acceptance', source: 'shared-processNaturalLanguage' });
console.log('SUCCESS', result.success);
console.log('REPLY\n', result.conversationalResponse);
console.log('RUN', result.actionResult?.runId, 'n8n', result.actionResult?.workflow);
console.log('ORGS', (result.actionResult?.prospects || []).slice(0, 12).map((p) => p.organizationName));
