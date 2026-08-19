/**
 * Day-2 local acceptance runner.
 * Discovery only. Does not contact anyone.
 */
import { AcquisitionEngine } from '../src/acquisition/engine.js';
import { AcquisitionStore } from '../src/acquisition/store.js';
import { N8NIntegration } from '../src/integrations/n8n-integration.js';

const ASW = 'https://www.affiliatesummit.com/west/exhibitors-2026';
const FALLBACK = 'https://en.wikipedia.org/wiki/Category:Online_advertising_services_and_affiliate_networks';

const engine = new AcquisitionEngine({
  n8n: new N8NIntegration(),
  store: new AcquisitionStore()
});

const asw = await engine.run({
  objective: 'Find exhibitors from the Affiliate Summit West 2026 public directory, extract organizations and available public company/contact information, normalize and deduplicate them, store the results, and send a small sample through the acquisition test n8n workflow.',
  sourceUrl: ASW,
  sourceEvent: 'Affiliate Summit West 2026',
  sourceType: 'exhibitor',
  maxPages: 8,
  maxOrganizations: 20,
  maxDepth: 1,
  skipEnrich: true,
  skipWorkflow: true
});

console.log('ASW_STATUS', asw.status);
console.log('ASW_PAGES', asw.stats.pagesSuccessful, '/', asw.stats.pagesAttempted);
console.log('ASW_ORGS', asw.stats.uniqueOrganizations);
console.log('ASW_ERRORS', JSON.stringify(asw.errors.slice(0, 5)));
console.log('ASW_NAMES', (asw.prospects || []).map((p) => p.organizationName).slice(0, 10));

let chosen = asw;
let source = ASW;
const quality = (asw.prospects || []).filter((p) => p.domain || p.website || p.contact?.email);
if (quality.length < 10) {
  console.log('ASW directory did not yield 10 organizations; using public Wikipedia vendor category.');
  chosen = await engine.run({
    objective: 'Extract organizations from this public affiliate/advertising vendor directory, normalize and deduplicate them, store them, and send a small sample through the acquisition test workflow.',
    sourceUrl: FALLBACK,
    sourceEvent: 'Public affiliate/advertising vendor directory (ASW 2026 exhibitor page is JS-rendered)',
    sourceType: 'directory',
    maxPages: 6,
    maxOrganizations: 20,
    maxDepth: 1,
    skipEnrich: false,
    skipNetwork: true,
    workflowAlias: 'acquisition-test'
  });
  source = FALLBACK;
}

console.log('CHOSEN_SOURCE', source);
console.log('RUN', chosen.runId);
console.log('STATUS', chosen.status);
console.log('STATS', JSON.stringify(chosen.stats, null, 2));
console.log('WORKFLOW', JSON.stringify(chosen.workflow));
console.log('CONTACTED', chosen.contacted);
console.log('SUMMARY\n' + chosen.summary);
console.log('ORGS');
for (const p of (chosen.prospects || []).slice(0, 25)) {
  console.log('-', p.organizationName, '|', p.domain || '', '|', p.website || '', '|', p.contact?.email || '');
}
