/**
 * Day-3 intelligence + qualification + campaign-prep engine.
 *
 * DISCOVER → RESEARCH → CONTACTS → VALIDATE → QUALIFY → SCORE
 * → OUTREACH PLAN → APPROVAL → n8n (prep only)
 *
 * Nobody is contacted from this path.
 */

import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import { createProspect, compactProspect } from '../acquisition/schema.js';
import { normalizeProspect } from '../acquisition/normalize.js';
import { dedupeProspects } from '../acquisition/dedupe.js';
import { AcquisitionStore } from '../acquisition/store.js';
import { BrowserRenderProvider } from '../providers/browser.js';
import { CompanyResearcher } from './research.js';
import { ContactDiscovery } from './contacts.js';
import { attachValidation } from './validation.js';
import { qualifyProspect } from './qualify.js';
import { rankProspects } from './score.js';
import { planOutreach } from '../outreach/plan.js';
import { OutreachEventLog } from '../outreach/events.js';

const ASW_URL = 'https://www.affiliatesummit.com/west/exhibitors-2026';

async function mapLimit(items, limit, fn) {
  const out = new Array(items.length);
  let cursor = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, items.length || 1)) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      out[index] = await fn(items[index], index);
    }
  });
  await Promise.all(workers);
  return out;
}

export function newCampaignId() {
  return `cmp_${randomUUID().replace(/-/g, '').slice(0, 12)}`;
}

export function newObjectiveId() {
  return `obj_${randomUUID().replace(/-/g, '').slice(0, 10)}`;
}

function extractUrl(text) {
  const match = String(text || '').match(/https?:\/\/[^\s)]+/i);
  return match ? match[0].replace(/[.,;]+$/, '') : null;
}

export class IntelligenceEngine {
  constructor(config = {}) {
    this.browser = config.browser || new BrowserRenderProvider({ firecrawl: config.firecrawl });
    this.acquisition = config.acquisition || null;
    this.researcher = config.researcher || new CompanyResearcher({ scraper: config.spider });
    this.contacts = config.contacts || new ContactDiscovery({ scraper: config.spider });
    this.enricher = config.enricher || null;
    this.store = config.store || new AcquisitionStore();
    this.events = config.events || new OutreachEventLog();
    this.approvalGate = config.approvalGate || null;
    this.n8n = config.n8n || null;
    this.campaigns = new Map();
  }

  isAvailable() {
    return Boolean(this.browser?.render);
  }

  isReady() {
    return this.isAvailable();
  }

  summarizeCampaign(campaign) {
    const scores = (campaign.prospects || []).map((p) => p.score?.total).filter((n) => typeof n === 'number');
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const top = scores.length ? Math.max(...scores) : null;
    const emailCount = (campaign.prospects || []).filter((p) => p.outreachPlan?.contact?.email).length;
    const callCount = (campaign.prospects || []).filter((p) => p.outreachPlan?.contact?.phone).length;
    return {
      campaignId: campaign.campaignId,
      objective: campaign.objective,
      source: campaign.sourceUrl,
      prospectsPrepared: campaign.prospects.length,
      topScore: top,
      averageScore: avg,
      channels: {
        emailProposed: emailCount,
        retellProposed: callCount
      },
      approvalStatus: campaign.approval?.status || 'pending',
      approvalId: campaign.approval?.id || null,
      workflowExecutionId: campaign.workflow?.executionId || null,
      contacted: false
    };
  }

  formatReport(campaign) {
    const s = this.summarizeCampaign(campaign);
    return [
      'Campaign prepared. No one was contacted.',
      `Objective: ${campaign.objectiveId}`,
      `Campaign: ${s.campaignId}`,
      `Source: ${s.source || 'n/a'}`,
      `${s.prospectsPrepared} prospects are ready for outreach.`,
      `Top score: ${s.topScore ?? 'n/a'}`,
      `Average score: ${s.averageScore ?? 'n/a'}`,
      `Retell calls proposed: ${s.channels.retellProposed}`,
      `Emails proposed: ${s.channels.emailProposed}`,
      `Approval: ${s.approvalStatus}${s.approvalId ? ` (${s.approvalId})` : ''}`,
      `Workflow execution: ${s.workflowExecutionId || 'n/a'}`,
      'Approval required before any outbound.'
    ].join('\n');
  }

  directoryToProspects(records, sourceUrl) {
    return records.map((rec) => createProspect({
      organizationName: rec.name,
      website: rec.website,
      domain: rec.website,
      description: rec.description,
      category: rec.sourceType || 'exhibitor',
      sourceUrl: rec.profileUrl || rec.sourceUrl || sourceUrl,
      sourceType: 'exhibitor',
      sourceEvent: rec.sourceEvent || null,
      booth: rec.booth || null,
      company: {
        location: rec.location || rec.country || null,
        socialUrls: rec.socialUrls || []
      },
      provenance: rec.provenance
    }));
  }

  async prepare(input = {}) {
    const startedAt = new Date().toISOString();
    const campaignId = newCampaignId();
    const objectiveId = newObjectiveId();
    const objective = String(input.objective || '').trim()
      || 'Find companies that could buy leads, research them, and prepare outreach.';
    const sourceUrl = input.sourceUrl || input.url || extractUrl(objective) || ASW_URL;
    const maxOrgs = Math.min(Number(input.maxOrganizations || input.topN || 20), 25);
    const profileId = input.qualificationProfile || input.profileId || 'qentrax-buyer';
    const errors = [];

    const campaign = {
      campaignId,
      objectiveId,
      objective,
      sourceUrl,
      profileId,
      startedAt,
      completedAt: null,
      status: 'running',
      providers: [],
      prospects: [],
      approval: null,
      workflow: null,
      errors,
      contacted: false
    };

    let records = [];
    const rendered = await this.browser.render(sourceUrl, { maxRecords: maxOrgs, waitFor: 4000 });
    campaign.providers.push(rendered.provider || 'browser-render');
    if (rendered.status === 'ok' && rendered.records?.length) {
      records = rendered.records.slice(0, maxOrgs);
    } else {
      errors.push({ stage: 'browser', error: rendered.error || 'no rendered records' });
      if (this.acquisition?.run) {
        const fallback = await this.acquisition.run({
          objective,
          sourceUrl,
          maxOrganizations: maxOrgs,
          maxPages: 8,
          skipWorkflow: true,
          skipEnrich: true
        });
        campaign.providers.push('acquisition-fallback');
        if (fallback.prospects?.length) {
          records = fallback.prospects.map((p) => ({
            name: p.organizationName,
            website: p.website,
            description: p.description,
            location: p.company?.location,
            socialUrls: p.company?.socialUrls,
            profileUrl: p.sourceUrl,
            sourceUrl,
            sourceType: p.sourceType,
            sourceEvent: p.sourceEvent,
            provenance: p.provenance
          }));
        } else {
          errors.push({ stage: 'acquisition-fallback', error: fallback.error || 'no prospects' });
        }
      }
    }

    let prospects = this.directoryToProspects(records, sourceUrl).map(normalizeProspect);
    const deduped = dedupeProspects(prospects);
    prospects = deduped.prospects;

    const researched = await mapLimit(prospects.slice(0, maxOrgs), 3, async (prospect) => {
      let next = prospect;
      if (!input.skipResearch && this.researcher && (prospect.website || prospect.domain)) {
        try {
          const intel = await this.researcher.research({
            organizationName: prospect.organizationName,
            website: prospect.website,
            domain: prospect.domain,
            description: prospect.description,
            sourceUrl: prospect.sourceUrl,
            company: prospect.company
          });
          if (intel.status === 'ok') {
            next = {
              ...next,
              intelligence: intel.intelligence,
              description: next.description || intel.intelligence.description?.value || null,
              provenance: {
                ...next.provenance,
                sourceUrls: [...new Set([...(next.provenance.sourceUrls || []), ...(intel.provenance.sourceUrls || [])])]
              }
            };
          }
        } catch (error) {
          errors.push({ stage: 'research', organization: prospect.organizationName, error: error.message });
        }
      }

      if (!input.skipContacts && this.contacts && next.website) {
        try {
          const found = await this.contacts.discover({
            organizationName: next.organizationName,
            website: next.website,
            contactPage: next.intelligence?.publicContactPage?.value
          });
          next.contacts = found.contacts || [];
          if (next.contacts[0]) {
            next.contact = {
              ...next.contact,
              fullName: next.contact.fullName || next.contacts[0].fullName,
              title: next.contact.title || next.contacts[0].title,
              email: next.contact.email || next.contacts[0].email,
              linkedinUrl: next.contact.linkedinUrl || next.contacts[0].publicProfileUrl
            };
          }
        } catch (error) {
          errors.push({ stage: 'contacts', organization: prospect.organizationName, error: error.message });
        }
      }

      if (this.enricher?.enrichOne && !input.skipEnrich) {
        try {
          const enriched = await this.enricher.enrichOne(next, { skipPublicWeb: true });
          next = enriched.prospect || next;
          campaign.providers.push(...(enriched.providers || []));
        } catch (error) {
          errors.push({ stage: 'enrich', organization: prospect.organizationName, error: error.message });
        }
      }

      next = attachValidation(next);
      next = qualifyProspect(next, { profileId, objective });
      next.outreachPlan = planOutreach(next, { objective });
      next.workflow = { ...(next.workflow || {}), status: 'prepared', executionId: null };
      return next;
    });

    const ranked = rankProspects(researched, maxOrgs);
    campaign.prospects = ranked.map((p) => compactProspect(p));
    campaign.providers = [...new Set(campaign.providers)];

    this.store.saveProspects(campaignId, campaign.prospects);
    this.store.saveRun({
      runId: campaignId,
      kind: 'campaign-prepare',
      objective,
      sourceUrl,
      startedAt,
      completedAt: new Date().toISOString(),
      stats: {
        recordsExtracted: records.length,
        uniqueOrganizations: campaign.prospects.length
      }
    });

    if (this.approvalGate) {
      const decision = this.approvalGate.evaluate({
        capabilityId: 'outreach.execute',
        input: { campaignId, audienceSize: campaign.prospects.length, recipients: campaign.prospects }
      });
      const request = await this.approvalGate.request({
        capabilityId: 'outreach.execute',
        input: {
          campaignId,
          prospectCount: campaign.prospects.length,
          channels: ['email', 'retell'],
          sample: campaign.prospects.slice(0, 3).map((p) => ({
            organizationName: p.organizationName,
            score: p.score?.total,
            email: p.contact?.email || null
          }))
        },
        reasons: decision.reasons.length
          ? decision.reasons
          : [{ policy: 'outbound-prep', reason: 'Prepared outreach requires explicit approval before execute' }],
        description: `Day-3 campaign ${campaignId}: ${campaign.prospects.length} prospects, do not contact`,
        requestedBy: input.actor || 'intelligence-engine'
      });
      campaign.approval = {
        id: request.id,
        status: request.status,
        required: true
      };
    } else {
      campaign.approval = { id: null, status: 'unavailable', required: true };
    }

    if (this.n8n?.execute) {
      const handed = campaign.prospects.slice(0, 8).map((p) => ({
        prospectId: p.prospectId,
        organizationName: p.organizationName,
        website: p.website,
        score: p.score?.total,
        qualification: p.qualification?.status,
        contact: p.contact,
        outreachPlan: {
          channelPriority: p.outreachPlan?.channelPriority,
          suggestedEmailSubject: p.outreachPlan?.suggestedEmailSubject
        }
      }));
      const wf = await this.n8n.execute(input.workflowAlias || 'campaign-prepare', {
        campaignId,
        objectiveId,
        objective,
        sourceUrl,
        prospects: handed,
        metadata: {
          profileId,
          approvalId: campaign.approval?.id || null,
          contacted: false
        }
      });
      campaign.workflow = {
        alias: wf.alias || 'campaign-prepare',
        status: wf.status,
        executionId: wf.executionId || wf.providerExecutionId || null,
        error: wf.error || null
      };
    }

    this.events.record('outreach.prepared', {
      campaignId,
      objectiveId,
      prospectCount: campaign.prospects.length,
      approvalId: campaign.approval?.id || null
    });

    campaign.completedAt = new Date().toISOString();
    campaign.status = 'prepared';
    this.campaigns.set(campaignId, campaign);
    this.store.saveRun({ ...campaign, runId: campaignId });

    logger.info(
      `Campaign ${campaignId} prepared: ${campaign.prospects.length} prospects, approval=${campaign.approval?.status}`
    );

    return {
      status: 'ok',
      ...this.summarizeCampaign(campaign),
      campaign,
      report: this.formatReport(campaign),
      contacted: false
    };
  }

  getCampaign(campaignId) {
    return this.campaigns.get(campaignId) || this.store.getRun(campaignId);
  }

  listCampaigns(limit = 10) {
    return [...this.campaigns.values()]
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
      .slice(0, limit)
      .map((c) => this.summarizeCampaign(c));
  }
}
