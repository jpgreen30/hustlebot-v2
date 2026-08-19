/**
 * Day-4 contact-intelligence + controlled-execution acceptance.
 * Never contacts discovered Affiliate Summit prospects.
 */
import { IntelligenceEngine } from '../src/intelligence/engine.js';
import { ContactDiscovery } from '../src/intelligence/contacts.js';
import { CompanyResearcher } from '../src/intelligence/research.js';
import { EnrichmentRouter } from '../src/intelligence/enrichment.js';
import { ApolloProvider } from '../src/providers/apollo.js';
import { CustomSpider } from '../src/providers/spider.js';
import { FirecrawlProvider } from '../src/providers/firecrawl.js';
import { BrowserRenderProvider } from '../src/providers/browser.js';
import { ProspectEnricher } from '../src/acquisition/enrich.js';
import { AcquisitionStore } from '../src/acquisition/store.js';
import { OutreachEventLog } from '../src/outreach/events.js';
import { ApprovalGate } from '../src/core/approval-gate.js';
import { OutreachExecutor } from '../src/outreach/execute.js';
import { SuppressionStore } from '../src/outreach/suppression.js';
import { OutreachEmailProvider } from '../src/outreach/email.js';
import { CampaignOrchestrator } from '../src/outreach/orchestrate.js';
import { N8NIntegration } from '../src/integrations/n8n-integration.js';
import { IntentDetector } from '../src/core/intent-detector.js';
import { CapabilityRegistry } from '../src/core/capability-registry.js';

const ASW = 'https://www.affiliatesummit.com/west/exhibitors-2026';

export async function runDay4Acceptance({ maxOrganizations = 8, executeTest = false } = {}) {
  const spider = new CustomSpider();
  const firecrawl = new FirecrawlProvider();
  const apollo = new ApolloProvider();
  const store = new AcquisitionStore();
  const events = new OutreachEventLog();
  const suppression = new SuppressionStore();
  const email = new OutreachEmailProvider();
  const gate = new ApprovalGate({ autoApprove: false });
  await gate.initialize();
  const n8n = new N8NIntegration();
  const contacts = new ContactDiscovery({ scraper: spider, apollo });
  const engine = new IntelligenceEngine({
    browser: new BrowserRenderProvider({ firecrawl }),
    firecrawl,
    spider,
    researcher: new CompanyResearcher({ scraper: spider }),
    contacts,
    enricher: new EnrichmentRouter({ publicWeb: new ProspectEnricher({ scraper: spider }), apollo }),
    apollo,
    store,
    events,
    approvalGate: gate,
    n8n,
    suppression
  });
  const executor = new OutreachExecutor({
    approvalGate: gate,
    events,
    suppression,
    email,
    engine,
    n8n
  });
  const orchestrator = new CampaignOrchestrator({ engine, executor, suppression, n8n, events });

  const prepared = await engine.prepare({
    objective: 'Take the top Qentrax prospects, find the best people to contact, score the contacts, and prepare an outreach campaign. Do not contact anyone.',
    sourceUrl: ASW,
    maxOrganizations,
    qualificationProfile: 'qentrax-buyer'
  });

  const detector = new IntentDetector({ llm: null, registry: new CapabilityRegistry() });
  const nl = detector.hintCampaignIntent(
    'Take the top Qentrax prospects, find the best people to contact, score the contacts, and prepare an outreach campaign. Do not contact anyone.'
  );

  const testCampaign = await engine.prepareTestCampaign({
    phoneNumber: process.env.RETELL_TEST_NUMBER || null,
    email: process.env.OUTREACH_TEST_EMAIL || process.env.EMAIL_TEST_DESTINATION || null
  });

  let testExecution = null;
  if (executeTest && testCampaign.status === 'ok' && testCampaign.approvalId) {
    await gate.approve(testCampaign.approvalId, 'day4-acceptance', 'authorized self-test only');
    testExecution = await executor.execute({
      approvalId: testCampaign.approvalId,
      campaignId: testCampaign.campaignId,
      authorizedTest: true,
      script: 'This is a HustleBot controlled outreach production test.'
    });
  }

  return {
    prepared,
    stats: prepared.contacts,
    apollo: apollo.isAvailable() ? 'configured' : 'UNAVAILABLE',
    email: email.isAvailable() ? 'configured' : 'UNAVAILABLE',
    nlCapability: nl?.capabilityId || null,
    control: engine.control({ query: 'Show me the decision makers.', campaignId: prepared.campaignId }),
    testCampaign,
    testExecution,
    orchestrateDiscovery: await orchestrator.run({
      campaignId: prepared.campaignId,
      approvalId: prepared.approvalId
    }),
    discoveredProspectsContacted: 0
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runDay4Acceptance({ maxOrganizations: Number(process.env.DAY4_MAX_ORGS || 8) })
    .then((result) => {
      console.log(JSON.stringify({
        campaignId: result.prepared.campaignId,
        companies: result.prepared.prospectsPrepared,
        contacts: result.stats,
        apollo: result.apollo,
        email: result.email,
        nl: result.nlCapability,
        testCampaign: result.testCampaign.status,
        discoveredProspectsContacted: 0
      }, null, 2));
    })
    .catch((error) => {
      console.error(error);
      process.exitCode = 1;
    });
}
