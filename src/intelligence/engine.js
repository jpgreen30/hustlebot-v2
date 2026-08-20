/**
 * Day-4 contact intelligence + campaign-prep engine.
 *
 * DISCOVER → RESEARCH → CONTACTS → ENRICH → RESOLVE → VALIDATE
 * → QUALIFY → SCORE → CONTACT QUALITY → PRIORITY → PLAN
 * → APPROVAL → n8n (prep / orchestrate)
 *
 * Nobody is contacted from the prepare path.
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
import { attachValidation, validateEmail, validatePhone } from './validation.js';
import { qualifyProspect } from './qualify.js';
import { rankProspects } from './score.js';
import { resolveContacts } from './identity.js';
import { attachContactScores } from './contact-score.js';
import { createContact } from './contact-schema.js';
import { planOutreach } from '../outreach/plan.js';
import { OutreachEventLog } from '../outreach/events.js';
import {
  applyApprovalToCampaign,
  setProspectOutreachState,
  transitionCampaign
} from '../outreach/campaign.js';

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

function applyContactValidation(contacts = []) {
  return contacts.map((contact) => {
    const email = validateEmail(contact.email, {
      providerStatus: contact.emailStatus === 'VALIDATED' ? 'VALIDATED' : undefined,
      provider: contact.provider
    });
    const phone = validatePhone(contact.phone, {
      providerStatus: contact.phoneStatus === 'VALIDATED' ? 'VALIDATED' : undefined,
      provider: contact.provider
    });
    return {
      ...contact,
      email: email.value,
      phone: phone.value || contact.phone || null,
      emailStatus: email.status,
      phoneStatus: phone.status,
      verificationStatus: email.status
    };
  });
}

export class IntelligenceEngine {
  constructor(config = {}) {
    this.browser = config.browser || new BrowserRenderProvider({ firecrawl: config.firecrawl });
    this.acquisition = config.acquisition || null;
    this.researcher = config.researcher || new CompanyResearcher({ scraper: config.spider });
    this.contacts = config.contacts || new ContactDiscovery({ scraper: config.spider, apollo: config.apollo });
    this.enricher = config.enricher || null;
    this.apollo = config.apollo || null;
    this.store = config.store || new AcquisitionStore();
    this.events = config.events || new OutreachEventLog();
    this.approvalGate = config.approvalGate || null;
    this.n8n = config.n8n || null;
    this.suppression = config.suppression || null;
    this.campaigns = new Map();
  }

  isAvailable() {
    return Boolean(this.browser?.render);
  }

  isReady() {
    return this.isAvailable();
  }

  contactStats(campaign) {
    const people = (campaign.prospects || []).flatMap((p) => p.contacts || []);
    return {
      people: people.length,
      emails: people.filter((c) => c.email).length,
      phones: people.filter((c) => c.phone).length,
      validatedEmails: people.filter((c) => c.emailStatus === 'VALIDATED').length,
      validatedPhones: people.filter((c) => c.phoneStatus === 'VALIDATED').length
    };
  }

  summarizeCampaign(campaign) {
    const scores = (campaign.prospects || []).map((p) => p.priority?.total ?? p.score?.total).filter((n) => typeof n === 'number');
    const avg = scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null;
    const top = scores.length ? Math.max(...scores) : null;
    const emailCount = (campaign.prospects || []).filter((p) => p.outreachPlan?.contact?.email).length;
    const callCount = (campaign.prospects || []).filter((p) => p.outreachPlan?.contact?.phone).length;
    const stats = this.contactStats(campaign);
    return {
      campaignId: campaign.campaignId,
      objective: campaign.objective,
      source: campaign.sourceUrl,
      kind: campaign.kind || 'discovery',
      lifecycle: campaign.lifecycle || campaign.status || 'PREPARED',
      prospectsPrepared: campaign.prospects.length,
      topScore: top,
      averageScore: avg,
      channels: {
        emailProposed: emailCount,
        retellProposed: callCount
      },
      contacts: stats,
      approvalStatus: campaign.approval?.status || 'pending',
      approvalId: campaign.approval?.id || null,
      workflowExecutionId: campaign.workflow?.executionId || null,
      contacted: campaign.contacted === true
    };
  }

  formatReport(campaign) {
    const s = this.summarizeCampaign(campaign);
    return [
      campaign.kind === 'authorized-test'
        ? 'Authorized test campaign prepared. Only allowlisted destinations may be contacted after approval.'
        : 'Campaign prepared. No one was contacted.',
      `Objective: ${campaign.objectiveId}`,
      `Campaign: ${s.campaignId}`,
      `State: ${s.lifecycle}`,
      `Source: ${s.source || 'n/a'}`,
      `${s.prospectsPrepared} prospects are ready for outreach.`,
      `People discovered: ${s.contacts.people}`,
      `Emails discovered: ${s.contacts.emails}`,
      `Phones discovered: ${s.contacts.phones}`,
      `Validated emails: ${s.contacts.validatedEmails}`,
      `Validated phones: ${s.contacts.validatedPhones}`,
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

  async enrichProspectContacts(prospect, options = {}) {
    const found = await this.contacts.discover({
      organization: prospect.organizationName,
      organizationName: prospect.organizationName,
      website: prospect.website,
      domain: prospect.domain,
      contactPage: prospect.intelligence?.publicContactPage?.value,
      objective: options.objective,
      qualificationProfile: options.profileId,
      targetRoles: options.targetRoles,
      enrichPeople: options.enrichPeople
    });
    const resolved = resolveContacts(found.contacts || []);
    const contacts = applyContactValidation(resolved.contacts);
    const next = {
      ...prospect,
      contacts,
      identity: found.identity
    };
    if (contacts[0]) {
      next.contact = {
        ...next.contact,
        fullName: next.contact.fullName || contacts[0].fullName,
        title: next.contact.title || contacts[0].title,
        email: next.contact.email || contacts[0].email,
        phone: next.contact.phone || contacts[0].phone,
        linkedinUrl: next.contact.linkedinUrl || contacts[0].linkedinUrl || contacts[0].publicProfileUrl
      };
    }
    return { prospect: next, providers: found.providers || [] };
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

    let campaign = {
      campaignId,
      objectiveId,
      objective,
      sourceUrl,
      profileId,
      kind: 'discovery',
      startedAt,
      completedAt: null,
      status: 'running',
      lifecycle: 'DRAFT',
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

      if (!input.skipContacts && this.contacts && (next.website || this.contacts.apollo?.isAvailable?.())) {
        try {
          const discovered = await this.enrichProspectContacts(next, {
            objective,
            profileId,
            enrichPeople: input.enrichPeople
          });
          next = discovered.prospect;
          campaign.providers.push(...discovered.providers);
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
      next = attachContactScores(next, { profileId });
      next.outreachPlan = planOutreach(next, { objective });
      next.workflow = { ...(next.workflow || {}), status: 'prepared', executionId: null };
      next = setProspectOutreachState(next, next.contacts?.length ? 'READY' : 'NOT_CONTACTED');
      return next;
    });

    const ranked = rankProspects(researched, maxOrgs).map((p) => attachContactScores(p, { profileId }));
    ranked.sort((a, b) => (b.priority?.total || b.score?.total || 0) - (a.priority?.total || a.score?.total || 0));
    campaign.prospects = ranked.map((p, index) => compactProspect({ ...p, rank: index + 1 }));
    campaign.providers = [...new Set(campaign.providers)];
    campaign = transitionCampaign(campaign, 'PREPARED', 'prepare.completed');

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
        uniqueOrganizations: campaign.prospects.length,
        ...this.contactStats(campaign)
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
            score: p.priority?.total || p.score?.total,
            email: p.contact?.email || null
          }))
        },
        reasons: decision.reasons.length
          ? decision.reasons
          : [{ policy: 'outbound-prep', reason: 'Prepared outreach requires explicit approval before execute' }],
        description: `Day-4 campaign ${campaignId}: ${campaign.prospects.length} prospects, do not contact discovered people`,
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

    campaign = applyApprovalToCampaign(campaign);

    if (this.n8n?.execute) {
      const handed = campaign.prospects.slice(0, 8).map((p) => ({
        prospectId: p.prospectId,
        organizationName: p.organizationName,
        website: p.website,
        score: p.score?.total,
        priority: p.priority?.total || null,
        qualification: p.qualification?.status,
        contact: p.contact,
        contacts: (p.contacts || []).slice(0, 3),
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
          contacted: false,
          kind: campaign.kind
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
      approvalId: campaign.approval?.id || null,
      contacts: this.contactStats(campaign)
    });

    campaign.completedAt = new Date().toISOString();
    campaign.status = 'prepared';
    this.persistCampaign(campaign);

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

  persistCampaign(campaign) {
    this.campaigns.set(campaign.campaignId, campaign);
    this.store.saveRun({ ...campaign, runId: campaign.campaignId });
    return campaign;
  }

  async refreshApproval(campaign) {
    if (!campaign?.approval?.id || !this.approvalGate?.get) return campaign;
    const record = await this.approvalGate.get(campaign.approval.id);
    if (!record) return campaign;
    const next = applyApprovalToCampaign({
      ...campaign,
      approval: { ...campaign.approval, status: record.status, id: record.id }
    });
    return this.persistCampaign(next);
  }

  async prepareTestCampaign(input = {}) {
    const phone = input.phoneNumber || process.env.RETELL_TEST_NUMBER || null;
    const email = input.email || process.env.OUTREACH_TEST_EMAIL || process.env.EMAIL_TEST_DESTINATION || null;
    if (!phone && !email) {
      return {
        status: 'blocked',
        error: 'No authorized test phone or email is configured',
        contacted: false
      };
    }
    const contact = createContact({
      fullName: input.fullName || 'Authorized Test Contact',
      title: input.title || 'Operator',
      organization: input.organizationName || 'HustleBot Test',
      email,
      phone,
      emailStatus: email ? 'DISCOVERED' : 'UNKNOWN',
      phoneStatus: phone ? 'DISCOVERED' : 'UNKNOWN',
      provider: 'authorized-test',
      source: 'day4-authorized-test',
      confidence: 1
    });
    let prospect = createProspect({
      organizationName: input.organizationName || 'HustleBot Test',
      website: 'https://hustlebot.test',
      description: 'Authorized Day-4 self-test identity. Not a discovered prospect.',
      sourceType: 'directory',
      contact: {
        fullName: contact.fullName,
        title: contact.title,
        email: contact.email,
        phone: contact.phone
      },
      provenance: { provider: 'authorized-test', sourceUrls: [], extractionMethod: 'configured' }
    });
    prospect.contacts = [contact];
    prospect = attachContactScores(qualifyProspect(attachValidation(prospect), {
      profileId: 'qentrax-buyer',
      objective: 'Authorized self-test'
    }), { profileId: 'qentrax-buyer' });
    prospect.outreachPlan = planOutreach(prospect, { objective: 'Authorized production self-test' });
    prospect.outreachState = 'READY';

    const campaignId = newCampaignId();
    let campaign = {
      campaignId,
      objectiveId: newObjectiveId(),
      objective: input.objective || 'Authorized HustleBot production self-test. Do not contact discovered prospects.',
      sourceUrl: null,
      profileId: 'qentrax-buyer',
      kind: 'authorized-test',
      startedAt: new Date().toISOString(),
      status: 'prepared',
      lifecycle: 'DRAFT',
      providers: ['authorized-test'],
      prospects: [compactProspect(prospect)],
      approval: null,
      workflow: null,
      errors: [],
      contacted: false,
      allowlist: { phones: [phone].filter(Boolean), emails: [email].filter(Boolean) }
    };
    campaign = transitionCampaign(campaign, 'PREPARED', 'test.prepared');

    if (this.approvalGate) {
      const request = await this.approvalGate.request({
        capabilityId: 'outreach.execute',
        input: {
          campaignId,
          kind: 'authorized-test',
          phone,
          email,
          contactDiscoveredProspects: false
        },
        reasons: [{ policy: 'authorized-test', reason: 'Controlled live execution against allowlisted test destinations only' }],
        description: `Day-4 authorized test campaign ${campaignId}`,
        requestedBy: input.actor || 'intelligence-engine'
      });
      campaign.approval = { id: request.id, status: request.status, required: true };
    }
    campaign = applyApprovalToCampaign(campaign);
    this.persistCampaign(campaign);
    this.events.record('outreach.prepared', { campaignId, kind: 'authorized-test', approvalId: campaign.approval?.id || null });
    return {
      status: 'ok',
      ...this.summarizeCampaign(campaign),
      campaign,
      report: this.formatReport(campaign),
      contacted: false
    };
  }

  latestCampaign() {
    return [...this.campaigns.values()].sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))[0] || null;
  }

  getCampaign(campaignId) {
    if (!campaignId || campaignId === 'latest') return this.latestCampaign() || this.store.getRun(campaignId);
    return this.campaigns.get(campaignId) || this.store.getRun(campaignId);
  }

  listCampaigns(limit = 10) {
    return [...this.campaigns.values()]
      .sort((a, b) => String(b.startedAt).localeCompare(String(a.startedAt)))
      .slice(0, limit)
      .map((c) => this.summarizeCampaign(c));
  }

  topProspects(campaign, n = 10) {
    return (campaign?.prospects || []).slice(0, n).map((p) => ({
      rank: p.rank,
      organizationName: p.organizationName,
      score: p.score?.total,
      priority: p.priority?.total || null,
      contactQuality: p.contactQuality?.total || null,
      contact: p.contact,
      outreachState: p.outreachState || 'NOT_CONTACTED',
      qualification: p.qualification?.status
    }));
  }

  decisionMakers(campaign) {
    return (campaign?.prospects || []).flatMap((p) => (p.contacts || []).map((c) => ({
      organizationName: p.organizationName,
      personId: c.personId,
      fullName: c.fullName,
      title: c.title,
      email: c.email,
      phone: c.phone,
      emailStatus: c.emailStatus,
      phoneStatus: c.phoneStatus,
      provider: c.provider,
      contactQuality: c.contactQuality?.total || p.contactQuality?.total || null
    })));
  }

  explainRank(campaign, query) {
    const text = String(query || '').toLowerCase();
    const match = (campaign?.prospects || []).find((p) => {
      const name = String(p.organizationName || '').toLowerCase();
      return name && text.includes(name.split(/\s+/)[0]);
    }) || (campaign?.prospects || [])[0];
    if (!match) return { status: 'empty', report: 'No scored prospect matches that name.' };
    return {
      status: 'ok',
      prospect: match.organizationName,
      rank: match.rank,
      companyScore: match.score,
      contactQuality: match.contactQuality,
      priority: match.priority,
      qualification: match.qualification,
      report: [
        `${match.organizationName} is ranked #${match.rank}.`,
        match.score?.explanation || '',
        match.contactQuality?.explanation || 'No contact quality yet.',
        match.priority ? `Combined priority ${match.priority.total} via ${match.priority.formula}` : '',
        match.qualification?.reasoningSummary || ''
      ].filter(Boolean).join('\n')
    };
  }

  pauseCampaign(campaignId, reason = 'operator.pause') {
    const campaign = this.getCampaign(campaignId || 'latest');
    if (!campaign) return { status: 'failed', error: 'no campaign' };
    this.suppression?.pauseCampaign(campaign.campaignId);
    const next = transitionCampaign(campaign, campaign.lifecycle === 'RUNNING' || campaign.lifecycle === 'APPROVED' || campaign.lifecycle === 'PAUSED' ? 'PAUSED' : campaign.lifecycle, reason);
    if (next.lifecycle === 'PREPARED' || next.lifecycle === 'PENDING_APPROVAL') {
      this.suppression?.pauseCampaign(campaign.campaignId);
    }
    const paused = { ...next, paused: true };
    this.persistCampaign(paused);
    this.events.record('outreach.paused', { campaignId: campaign.campaignId, reason });
    return { status: 'ok', campaignId: campaign.campaignId, lifecycle: paused.lifecycle, report: `Campaign ${campaign.campaignId} paused.` };
  }

  resumeCampaign(campaignId, reason = 'operator.resume') {
    const campaign = this.getCampaign(campaignId || 'latest');
    if (!campaign) return { status: 'failed', error: 'no campaign' };
    this.suppression?.resumeCampaign(campaign.campaignId);
    const next = campaign.lifecycle === 'PAUSED'
      ? transitionCampaign(campaign, campaign.approval?.status === 'approved' ? 'RUNNING' : 'APPROVED', reason)
      : campaign;
    const resumed = { ...next, paused: false };
    this.persistCampaign(resumed);
    this.events.record('outreach.resumed', { campaignId: campaign.campaignId, reason });
    return { status: 'ok', campaignId: campaign.campaignId, lifecycle: resumed.lifecycle, report: `Campaign ${campaign.campaignId} resumed.` };
  }

  async control(input = {}) {
    let campaign = this.getCampaign(input.campaignId || 'latest');
    if (campaign) campaign = await this.refreshApproval(campaign);
    const action = String(input.action || input.query || '').trim();
    if (!campaign && !/prepare|test/i.test(action)) {
      return { status: 'empty', report: 'No campaign is loaded yet. Prepare one first.' };
    }
    if (/^pause/i.test(action)) return this.pauseCampaign(campaign?.campaignId);
    if (/^resume/i.test(action)) return this.resumeCampaign(campaign?.campaignId);
    if (/start outreach|begin outreach|launch outreach/i.test(action)) {
      return {
        status: 'blocked',
        requiresApproval: true,
        approvalId: campaign?.approval?.id || null,
        approvalStatus: campaign?.approval?.status || 'missing',
        report: campaign?.approval?.status === 'approved'
          ? `Approval ${campaign.approval.id} is present. Use outreach.execute on the authorized test campaign only. Discovered prospects stay uncontacted.`
          : `Start outreach is blocked until ApprovalGate is approved. Current status: ${campaign?.approval?.status || 'missing'}.`
      };
    }
    if (/decision maker/i.test(action)) {
      const people = this.decisionMakers(campaign);
      return {
        status: 'ok',
        people,
        report: people.length
          ? `Decision makers (${people.length}):\n${people.slice(0, 15).map((p) => `- ${p.fullName || 'unknown'} · ${p.title || 'n/a'} · ${p.organizationName} · ${p.email || 'no email'}`).join('\n')}`
          : 'No decision makers discovered. Zero is a legitimate provider result.'
      };
    }
    if (/top\s+(\d+)/i.test(action) || /who are the top/i.test(action)) {
      const n = Number((action.match(/top\s+(\d+)/i) || [])[1] || 10);
      const top = this.topProspects(campaign, n);
      return {
        status: 'ok',
        prospects: top,
        report: top.map((p) => `#${p.rank} ${p.organizationName} · company ${p.score ?? 'n/a'} · priority ${p.priority ?? 'n/a'} · ${p.contact?.fullName || 'no person'}`).join('\n')
      };
    }
    if (/why .*(rank|high|score)/i.test(action) || /why is /i.test(action)) {
      return this.explainRank(campaign, action);
    }
    if (/how many|verified contact/i.test(action)) {
      const stats = this.contactStats(campaign);
      return {
        status: 'ok',
        ...stats,
        report: `${stats.people} people, ${stats.emails} emails, ${stats.phones} phones, ${stats.validatedEmails} validated emails, ${stats.validatedPhones} validated phones.`
      };
    }
    if (/outreach results/i.test(action)) {
      const events = this.events.list({ campaignId: campaign.campaignId, limit: 20 });
      return {
        status: 'ok',
        events,
        contacted: campaign.contacted === true,
        report: events.length
          ? events.map((e) => `${e.at} ${e.type}`).join('\n')
          : `No outreach execution events. Campaign ${campaign.campaignId} is ${campaign.lifecycle}. Discovered prospects contacted: 0.`
      };
    }
    const summary = this.summarizeCampaign(campaign);
    return {
      status: 'ok',
      ...summary,
      report: this.formatReport(campaign)
    };
  }
}

/**
 * HTTP adapter for POST /api/campaign/control.
 * Must await control() — res.json(promise) serializes to {}.
 */
export async function handleCampaignControlHttp(engine, req, res) {
  if (!engine) {
    return res.status(503).json({ error: 'Intelligence engine not initialized' });
  }
  const result = await engine.control(req.body || {});
  return res.json(result);
}

