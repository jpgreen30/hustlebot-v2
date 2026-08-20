/**
 * Intelligence fabric: compose source selection, query planning, graph ingest,
 * verification, market mapping. Not a mega-capability that hides primitives.
 */

import { looksLikeCompany, isJunkResult, discoveryIntent, commercialScore } from '../objective/discover.js';
import { wrapUntrusted } from '../objective/context-pack.js';
import { extractSlices } from '../objective/quantities.js';
import {
  createIntelligenceRequest, CLAIM_STATUS, TRUST_CLASS, EVIDENCE_BUDGET, INTEL_INTENT, SOURCE_KIND
} from './schema.js';
import { planSearchQueries, recordQueryHit } from './queries.js';
import { SourceRegistry } from './sources.js';
import { EvidenceGraph } from './graph.js';

function firstParty(url, domain) {
  try {
    const host = new URL(url).hostname.replace(/^www\./, '').toLowerCase();
    return Boolean(domain) && (host === domain || host.endsWith(`.${domain}`));
  } catch {
    return false;
  }
}

function discoveryHints(request, input = {}) {
  const question = request.question || '';
  const slices = (Array.isArray(input.slices) && input.slices.length)
    ? input.slices
    : extractSlices(question);
  const geography = request.geography
    || input.location
    || (question.match(/\b(los angeles|la-area|southern california|van nuys|california)\b/i)?.[0] || null);
  const industry = slices.find((s) => /roofing|solar|hvac|insurance|logistics|freight|trucking|warehous|home-service/i.test(s))
    || null;
  return { geography, industry, slices };
}

export class IntelligenceFabric {
  constructor({
    store,
    sources,
    graph,
    search,
    discovery,
    researcher,
    contactDiscovery,
    router,
    fabric,
    operationalMemory
  } = {}) {
    this.store = store;
    this.sources = sources || new SourceRegistry({ store, fabric });
    this.graph = graph || new EvidenceGraph({ store });
    this.search = search || null;
    this.discovery = discovery || null;
    this.researcher = researcher || null;
    this.contactDiscovery = contactDiscovery || null;
    this.router = router || null;
    this.fabric = fabric || null;
    this.operationalMemory = operationalMemory || null;
  }

  stats() {
    return this.store?.snapshot?.() || {};
  }

  stopReason(findings, request, startedAt) {
    const need = Number(request.quantity || 10);
    const unique = new Set(findings.map((f) => (f.domain || f.name || '').toLowerCase()));
    if (unique.size >= need) return 'requested quantity reached';
    if (Date.now() - startedAt > 90000) return 'time budget';
    const last = findings.slice(-3);
    if (findings.length >= 6 && last.every((f) => unique.has((f.domain || '').toLowerCase()))) {
      return 'diminishing unique entities';
    }
    return null;
  }

  async research(input = {}, context = {}) {
    const request = createIntelligenceRequest(input);
    await this.store?.put?.('requests', { ...request, id: request.intelligenceRequestId });
    const overlay = this.fabric?.healthOverlay?.() || context.healthOverlay || {};
    const memory = this.operationalMemory?.recall?.({ query: request.question, limit: 5 }) || [];
    const selected = this.sources.select(request, {
      healthOverlay: overlay,
      memory,
      forceUnavailable: context.forceUnavailable || []
    });
    const hints = discoveryHints(request, input);
    const queries = planSearchQueries({
      ...request,
      slices: hints.slices,
      geography: hints.geography,
      query: request.question
    });
    const startedAt = Date.now();
    const findings = [];
    const errors = [];
    const sourcesUsed = [];
    const down = new Set(context.forceUnavailable || []);

    const searchers = selected.filter((s) => s.sourceType === SOURCE_KIND.SEARCH_ENGINE && !down.has(s.provider));
    const searcher = searchers[0];
    if (down.size && !searcher) {
      const failed = [...down][0];
      errors.push({ provider: failed, error: 'preferred search unavailable', kind: 'PROVIDER_FAILURE' });
      if (this.store?.stats) this.store.stats.sourceFailures += 1;
    }

    if (searcher && this.search?.search) {
      for (const planned of queries) {
        const halt = this.stopReason(findings, request, startedAt);
        if (halt) {
          request.stopReason = halt;
          break;
        }
        let searched;
        try {
          searched = await this.search.search(planned.query, { limit: Math.max(request.quantity, 10) });
        } catch (error) {
          errors.push({ provider: searcher.provider, error: error.message, kind: 'TRANSIENT' });
          if (this.store?.stats) this.store.stats.sourceFailures += 1;
          continue;
        }
        sourcesUsed.push(searched.provider || searcher.provider);
        if (searched.status !== 'ok' || !searched.results?.length) {
          errors.push({
            provider: searched.provider || searcher.provider,
            error: searched.error || 'zero results',
            kind: /challenge|captcha/i.test(String(searched.error || '')) ? 'PROVIDER_PROTOCOL' : 'EMPTY'
          });
          if (this.store?.stats) this.store.stats.sourceFailures += 1;
          continue;
        }
        const intent = discoveryIntent(planned.query, request.question);
        for (const item of searched.results) {
          if (isJunkResult(item, intent) && !looksLikeCompany(item)) continue;
          if (!looksLikeCompany(item) && !item.url) continue;
          const ingested = await this.ingestProspect({
            organizationName: item.title || item.organizationName,
            website: item.url,
            description: item.snippet,
            sourceUrl: item.url
          }, {
            request,
            query: planned.query,
            provider: searched.provider,
            sourceUrl: item.url,
            snippet: item.snippet
          });
          if (ingested) {
            findings.push(ingested);
            recordQueryHit(queries, planned.query, [ingested.evidenceId]);
          }
        }
      }
    }

    if (!findings.length && this.discovery?.discover) {
      const fallback = await this.discovery.discover({
        query: request.question,
        objective: request.question,
        maxOrganizations: request.quantity,
        location: hints.geography,
        industry: hints.industry,
        slices: hints.slices
      }, context);
      for (const p of fallback.prospects || []) {
        findings.push(await this.ingestProspect(p, {
          request,
          query: request.question,
          provider: (fallback.providers || [])[0],
          sourceUrl: p.sourceUrl || p.website
        }));
      }
      sourcesUsed.push(...(fallback.providers || []));
      if (errors.length) {
        request.alternateStrategy = {
          failed: errors[0],
          replacement: (fallback.providers || [])[0] || 'org.discover',
          why: 'Search-shaped discovery via OrgDiscovery after preferred search source failed. Did not scrape a random URL.'
        };
      }
    }

    const unique = [];
    const seen = new Set();
    for (const row of findings.filter(Boolean)) {
      const key = (row.entity?.domain || row.entity?.name || '').toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      unique.push(row);
    }

    const top = unique.slice(0, request.quantity);
    const gaps = [];
    if (top.length < request.quantity) {
      gaps.push({
        type: 'quantity',
        detail: `Requested ${request.quantity}, found ${top.length} legitimate entities. Not padded with junk.`
      });
    }

    return {
      status: top.length ? 'ok' : 'empty',
      request,
      queries,
      sourcesSelected: selected.map((s) => ({ sourceId: s.sourceId, provider: s.provider, reasonSelected: s.reasonSelected })),
      sourcesUsed: [...new Set(sourcesUsed)],
      entities: top.map((t) => t.entity),
      claims: top.flatMap((t) => t.claims || []),
      evidence: top.flatMap((t) => t.evidence || []),
      prospects: top.map((t) => ({
        organizationName: t.entity.name,
        website: t.entity.website,
        domain: t.entity.domain,
        description: t.entity.description || null,
        entityId: t.entity.entityId,
        evidenceIds: t.evidenceIds
      })),
      top: top.slice(0, Math.min(5, top.length)).map((t) => t.entity),
      gaps,
      errors,
      stopReason: request.stopReason || (top.length >= request.quantity ? 'requested quantity reached' : 'search exhausted'),
      report: this.formatReport(request, top, gaps, queries),
      contacted: false,
      fabricated: false
    };
  }

  async ingestProspect(prospect, meta = {}) {
    const name = prospect.organizationName || prospect.name || prospect.title;
    const website = prospect.website || prospect.url;
    if (!name && !website) return null;
    const up = await this.graph.upsertEntity({
      name,
      website,
      domain: prospect.domain,
      type: /app|platform|tracker|software/i.test(`${name} ${prospect.description || ''}`)
        ? 'PRODUCT'
        : 'ORGANIZATION',
      provenance: { query: meta.query, provider: meta.provider }
    });
    const trust = firstParty(meta.sourceUrl || website, up.entity.domain)
      ? TRUST_CLASS.FIRST_PARTY
      : TRUST_CLASS.SEARCH_SNIPPET;
    const evidence = await this.graph.addEvidence({
      entityId: up.entity.entityId,
      objectiveId: meta.request?.objectiveId,
      sourceUrl: meta.sourceUrl || website,
      sourceType: trust === TRUST_CLASS.FIRST_PARTY ? 'FIRST_PARTY_WEB' : 'SEARCH_ENGINE',
      excerpt: meta.snippet || prospect.description || name,
      extractionMethod: meta.provider || 'search',
      query: meta.query,
      provider: meta.provider,
      trustClass: trust,
      untrusted: /ignore (your|the) (objective|instructions)/i.test(String(meta.snippet || ''))
    });
    const claim = await this.graph.addClaim({
      subjectEntityId: up.entity.entityId,
      predicate: 'described_as',
      value: prospect.description || name,
      evidenceIds: [evidence.evidenceId],
      confidence: commercialScore({ title: name, url: website, snippet: prospect.description }) / 100
    });
    up.entity.description = prospect.description || up.entity.description || null;
    const claims = [claim];
    const evidenceIds = [evidence.evidenceId];

    for (const person of prospect.contacts || []) {
      const personName = person.fullName || person.name || [person.firstName, person.lastName].filter(Boolean).join(' ');
      if (!personName) continue;
      const pe = await this.graph.upsertEntity({
        name: personName,
        type: 'PERSON',
        provenance: { query: meta.query, provider: meta.provider }
      });
      await this.graph.relate(pe.entity.entityId, 'worksAt', up.entity.entityId, {
        validFrom: person.observedAt || person.asOf || null,
        validTo: person.validTo || null,
        evidenceIds: [evidence.evidenceId]
      });
      if (person.title) {
        claims.push(await this.graph.addClaim({
          subjectEntityId: pe.entity.entityId,
          predicate: 'title',
          value: person.title,
          evidenceIds: [evidence.evidenceId],
          status: CLAIM_STATUS.DISCOVERED
        }));
      }
    }

    if (meta.eventId || prospect.eventId || prospect.exhibitsAt) {
      const eventRef = meta.eventId || prospect.eventId || prospect.exhibitsAt;
      const evEnt = typeof eventRef === 'string' && eventRef.startsWith('ent_')
        ? { entity: { entityId: eventRef } }
        : await this.graph.upsertEntity({
          name: typeof eventRef === 'string' ? eventRef : eventRef.name,
          type: 'EVENT',
          provenance: { query: meta.query, provider: meta.provider }
        });
      await this.graph.relate(up.entity.entityId, 'exhibitsAt', evEnt.entity.entityId, {
        evidenceIds: [evidence.evidenceId]
      });
    }

    return {
      entity: up.entity,
      merged: up.merged,
      evidence,
      claims,
      evidenceIds,
      evidenceId: evidence.evidenceId
    };
  }

  formatReport(request, top, gaps, queries) {
    const lines = [
      `Intelligence ${request.intent} · ${top.length} entities (requested ${request.quantity}).`,
      `Queries: ${queries.map((q) => q.query).join(' | ')}`,
      ...top.slice(0, 8).map((t, i) => {
        const ev = t.evidence?.sourceUrl || t.entity.website || 'n/a';
        return `#${i + 1} ${t.entity.name} · ${t.entity.domain || 'no domain'} · ${ev}`;
      }),
      ...gaps.map((g) => `Gap: ${g.detail}`),
      'Discovered prospects contacted: 0.'
    ];
    return lines.join('\n');
  }

  async verify(input = {}) {
    const entity = this.graph.findByAlias(input.entity || input.name)
      || this.graph.entities().find((e) => e.entityId === input.entityId);
    if (!entity) {
      return {
        status: 'insufficient-evidence',
        reason: 'entity not in graph',
        contacted: false
      };
    }
    const claims = this.graph.claims().filter((c) =>
      c.subjectEntityId === entity.entityId
      && (!input.predicate || c.predicate === input.predicate)
    );
    const claim = input.claim
      ? claims.find((c) => String(c.value).includes(String(input.claim))) || claims[0]
      : claims[0];
    if (!claim) {
      return { status: 'insufficient-evidence', entity, contacted: false };
    }
    const independent = this.graph.independentEvidence(claim.evidenceIds);
    let status = 'insufficient-evidence';
    if (claim.status === CLAIM_STATUS.CONFLICTED) status = 'conflicted';
    else if (independent.some((e) => e.trustClass === TRUST_CLASS.FIRST_PARTY) && independent.length >= 1) {
      status = independent.length >= 2 ? 'corroborated' : 'discovered';
    } else if (independent.length >= 2) status = 'corroborated';
    else if (independent.length === 1) status = 'discovered';
    return {
      status,
      claimStatus: claim.status,
      entity,
      claim,
      independentCount: independent.length,
      evidence: independent,
      note: 'LLM confidence is not used as verification.',
      contacted: false
    };
  }

  async refresh(input = {}) {
    const entity = this.graph.findByAlias(input.entity || input.name)
      || this.graph.store.get('entities', input.entityId);
    if (!entity) return { status: 'empty', report: 'Unknown entity' };
    const priorClaims = this.graph.claims().filter((c) => c.subjectEntityId === entity.entityId);
    const result = await this.research({
      question: `${entity.name} ${entity.domain || ''} official website`.trim(),
      quantity: 3,
      intent: INTEL_INTENT.VERIFY,
      objectiveId: input.objectiveId
    }, input.context || {});
    return {
      status: 'ok',
      entity,
      priorClaims: priorClaims.map((c) => c.claimId),
      refreshed: result.entities,
      historicalPreserved: true,
      contacted: false
    };
  }

  async marketMap(input = {}, context = {}) {
    const researched = await this.research({
      ...input,
      intent: INTEL_INTENT.MARKET_MAP,
      question: input.question || input.rawRequest
    }, context);
    const gaps = researched.gaps.slice();
    const pricing = researched.entities.filter((e) => /price|pricing|\$\d/i.test(e.description || ''));
    if (!pricing.length) {
      gaps.push({
        type: 'OBSERVED',
        detail: 'No public pricing snippets were extracted from discovery results. Absence is not proof that nobody publishes pricing.'
      });
    }
    return {
      ...researched,
      market: {
        providers: researched.entities,
        publicPricingFound: pricing,
        gaps,
        hypothesesRejected: [
          'Gaps are OBSERVED in this sample, not a census of the market.'
        ]
      }
    };
  }

  wrapPage(text, meta = {}) {
    return wrapUntrusted(JSON.stringify({ kind: 'web-page', text, ...meta }));
  }
}
