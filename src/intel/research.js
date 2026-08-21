/**
 * Intelligence fabric: compose source selection, query planning, graph ingest,
 * verification, market mapping. Not a mega-capability that hides primitives.
 */

import { looksLikeCompany, isJunkResult, discoveryIntent, commercialScore, onTopic } from '../objective/discover.js';
import { wrapUntrusted } from '../objective/context-pack.js';
import { extractSlices } from '../objective/quantities.js';
import {
  createIntelligenceRequest, CLAIM_STATUS, TRUST_CLASS, EVIDENCE_BUDGET, INTEL_INTENT, SOURCE_KIND, newId
} from './schema.js';
import { planSearchQueries, recordQueryHit } from './queries.js';
import { SourceRegistry } from './sources.js';
import { EvidenceGraph } from './graph.js';
import { classifySearchResult, RESULT_ROLE, inferPlaybookClass, sourceRolesForClassification } from './classify.js';
import { evaluateResearch, rankingComponents, QUALITY } from './quality.js';
import { proposeAdaptations, extractVocabulary, isNovelQuery, normalizeQuery } from './adapt.js';
import { matchPlaybook, recordPlaybookOutcome, shouldTrustObservation } from './playbook.js';
import { preferredDisplayName } from './names.js';

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

  stopReason(findings, request, startedAt, budget = {}) {
    const need = Number(request.quantity || 10);
    const unique = new Set(findings.map((f) => (f.domain || f.entity?.domain || f.name || '').toLowerCase()));
    if (unique.size >= need) return 'requested quantity reached';
    const maxMs = Number(budget.maxDurationMs || request.maxDurationMs || 90000);
    if (Date.now() - startedAt > maxMs) return 'time budget';
    const last = findings.slice(-3);
    if (findings.length >= 6 && last.every((f) => unique.has((f.domain || f.entity?.domain || '').toLowerCase()))) {
      return 'diminishing unique entities';
    }
    return null;
  }

  filterMemory(memory, question) {
    const playbook = inferPlaybookClass(question);
    return (memory || []).filter((m) => {
      const content = String(m.content || '');
      if (/ignore (your|the) (objective|instructions)|disable approvalgate/i.test(content)) return false;
      if (playbook === 'product-landscape' && /wikipedia/i.test(content) && /always works|for all product/i.test(content)) {
        return false;
      }
      return true;
    });
  }

  async considerItem(item, meta, buckets) {
    const question = meta.request?.question || '';
    const classified = classifySearchResult(item, question);
    this.store?.bump?.('entitiesDiscovered');
    if (classified.role === RESULT_ROLE.REJECT) {
      buckets.rejected.push({ ...item, classification: classified, reason: classified.reasons.join(',') });
      this.store?.bump?.('entitiesRejected');
      return null;
    }
    if (classified.role === RESULT_ROLE.SOURCE) {
      const sourceRoles = sourceRolesForClassification(classified);
      buckets.sources.push({ ...item, classification: classified, sourceRoles });
      buckets.rejected.push({ ...item, classification: classified, reason: classified.reasons.join(',') });
      this.store?.bump?.('entitiesRejected');
      if (item.url || item.website) {
        await this.graph.addEvidence({
          objectiveId: meta.request?.objectiveId,
          sourceUrl: item.url || item.website,
          excerpt: item.snippet || item.title || classified.pageKind,
          trustClass: TRUST_CLASS.DIRECTORY,
          query: meta.query,
          provider: meta.provider,
          sourceType: classified.pageKind
        });
      }
      return null;
    }
    const ingested = await this.ingestProspect({
      organizationName: item.title || item.organizationName || item.name,
      website: item.url || item.website,
      description: item.snippet || item.description,
      sourceUrl: item.url || item.website,
      title: item.title,
      jsonLdName: item.jsonLdName,
      ogSiteName: item.ogSiteName
    }, { ...meta, pageKind: classified.pageKind });
    if (ingested) {
      ingested.classification = classified;
      ingested.sourceRoles = sourceRolesForClassification(classified);
      ingested.firstParty = ingested.evidence?.trustClass === TRUST_CLASS.FIRST_PARTY;
      buckets.accepted.push(ingested);
      this.store?.bump?.('entitiesAccepted');
    }
    return ingested;
  }

  async research(input = {}, context = {}) {
    const request = createIntelligenceRequest(input);
    request.maxQueries = Number(input.maxQueries || request.maxQueries || 8);
    request.maxAdaptations = Number(input.maxAdaptations ?? 2);
    request.maxDurationMs = Number(input.maxDurationMs || 90000);
    await this.store?.put?.('requests', { ...request, id: request.intelligenceRequestId });
    this.store?.bump?.('researchRuns');
    const overlay = this.fabric?.healthOverlay?.() || context.healthOverlay || {};
    const rawMemory = this.operationalMemory?.recall?.({ query: request.question, limit: 5 }) || [];
    const memory = this.filterMemory(rawMemory, request.question);
    const selected = this.sources.select(request, {
      healthOverlay: overlay,
      memory,
      forceUnavailable: context.forceUnavailable || []
    });
    const hints = discoveryHints(request, input);
    const playbook = matchPlaybook(request.question);
    let queries = planSearchQueries({
      ...request,
      slices: hints.slices,
      geography: hints.geography,
      query: input.query || request.question
    });
    const startedAt = Date.now();
    const findings = [];
    const buckets = { accepted: [], rejected: [], sources: [] };
    const errors = [];
    const sourcesUsed = [];
    const sourcesAttempted = [];
    const adaptations = [];
    const discoveryPath = [];
    const down = new Set(context.forceUnavailable || []);
    const vocabulary = [];
    let quality = null;

    const searchers = selected.filter((s) => s.sourceType === SOURCE_KIND.SEARCH_ENGINE && !down.has(s.provider));
    const searcher = searchers[0];
    if (down.size && !searcher) {
      const failed = [...down][0];
      errors.push({ provider: failed, error: 'preferred search unavailable', kind: 'PROVIDER_FAILURE' });
      this.store?.bump?.('sourceFailures');
    }

    const runQueries = async (plannedList) => {
      if (!searcher || !this.search?.search) return;
      for (const planned of plannedList) {
        const halt = this.stopReason(findings, request, startedAt, { maxDurationMs: request.maxDurationMs });
        if (halt) {
          request.stopReason = halt;
          break;
        }
        this.store?.bump?.('queriesIssued');
        sourcesAttempted.push(searcher.provider);
        let searched;
        try {
          searched = await this.search.search(planned.query, { limit: Math.max(request.quantity, 10) });
        } catch (error) {
          errors.push({ provider: searcher.provider, error: error.message, kind: 'TRANSIENT' });
          this.store?.bump?.('sourceFailures');
          continue;
        }
        if (searched.status !== 'ok' || !searched.results?.length) {
          errors.push({
            provider: searched.provider || searcher.provider,
            error: searched.error || 'zero results',
            kind: /challenge|captcha/i.test(String(searched.error || '')) ? 'PROVIDER_PROTOCOL' : 'EMPTY'
          });
          this.store?.bump?.('sourceFailures');
          continue;
        }
        sourcesUsed.push(searched.provider || searcher.provider);
        this.store?.bump?.('sourcesUsed');
        const intent = discoveryIntent(planned.query, request.question);
        vocabulary.push(...extractVocabulary((searched.results || []).map((r) => r.snippet), request.question));
        let acceptedThis = 0;
        for (const item of searched.results) {
          if (isJunkResult(item, intent) && classifySearchResult(item, request.question).role !== RESULT_ROLE.CANDIDATE) {
            buckets.rejected.push({ ...item, reason: 'junk' });
            continue;
          }
          if (!onTopic(item, planned.query, intent) && !onTopic(item, request.question, intent)
            && classifySearchResult(item, request.question).role === RESULT_ROLE.CANDIDATE) {
            continue;
          }
          const ingested = await this.considerItem(item, {
            request,
            query: planned.query,
            provider: searched.provider,
            sourceUrl: item.url,
            snippet: item.snippet
          }, buckets);
          if (ingested) {
            findings.push(ingested);
            acceptedThis += 1;
            recordQueryHit(queries, planned.query, [ingested.evidenceId]);
          }
        }
        planned.acceptedEntityYield = acceptedThis;
        planned.noiseRatio = searched.results.length ? (searched.results.length - acceptedThis) / searched.results.length : 1;
      }
    };

    await runQueries(queries);

    // A directory/listicle is never an entity, but it can be mined as a bounded
    // candidate source. OrgDiscovery owns robots-aware extraction.
    if (this.discovery?.discover && buckets.sources.length) {
      const sourcePages = buckets.sources.slice(0, Number(input.maxSourcePages || 4));
      for (const source of sourcePages) {
        if (Date.now() - startedAt >= request.maxDurationMs) break;
        const sourceUrl = source.url || source.website;
        if (!sourceUrl) continue;
        const expanded = await this.discovery.discover({
          sourceUrl,
          query: request.question,
          objective: request.question,
          maxOrganizations: Math.min(Number(input.maxCandidateExpansion || request.quantity * 2), 24),
          location: hints.geography,
          industry: hints.industry
        }, context);
        const before = findings.length;
        for (const p of expanded.prospects || []) {
          const ingested = await this.considerItem({
            title: p.organizationName || p.name,
            url: p.website || p.url,
            snippet: p.description
          }, {
            request,
            query: request.question,
            provider: (expanded.providers || [])[0],
            sourceUrl: p.sourceUrl || p.website
          }, buckets);
          if (ingested) findings.push(ingested);
        }
        discoveryPath.push({
          depth: 1,
          sourceUrl,
          sourceRoles: source.sourceRoles,
          provider: (expanded.providers || [])[0] || null,
          candidatesExtracted: Math.max(0, findings.length - before),
          errors: expanded.errors || []
        });
        sourcesAttempted.push(...(expanded.providers || []));
        sourcesUsed.push(...(expanded.providers || []));
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
      this.store?.bump?.('sourcesAttempted');
      for (const p of fallback.prospects || []) {
        const ingested = await this.considerItem({
          title: p.organizationName || p.name,
          url: p.website || p.url,
          snippet: p.description
        }, {
          request,
          query: request.question,
          provider: (fallback.providers || [])[0],
          sourceUrl: p.sourceUrl || p.website
        }, buckets);
        if (ingested) findings.push(ingested);
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

    const uniqueRows = () => {
      const unique = [];
      const seen = new Set();
      for (const row of findings.filter(Boolean)) {
        const key = (row.entity?.domain || row.entity?.name || '').toLowerCase();
        if (!key || seen.has(key)) continue;
        seen.add(key);
        unique.push(row);
      }
      return unique;
    };

    const verifyFirstParty = async (rows) => {
      if (!this.researcher?.research) return;
      for (const row of rows.slice(0, request.quantity)) {
        if (Date.now() - startedAt >= request.maxDurationMs) break;
        if (!row?.entity?.website || row.firstParty) continue;
        try {
          const verified = await this.researcher.research({
            organizationName: row.entity.name,
            website: row.entity.website,
            domain: row.entity.domain,
            description: null,
            sourceUrl: row.entity.website
          });
          const sourceUrl = verified?.provenance?.sourceUrls?.[0];
          if (verified?.status !== 'ok' || !sourceUrl || !firstParty(sourceUrl, row.entity.domain)) continue;
          const description = verified.intelligence?.description?.value || row.entity.description;
          const officialName = verified.intelligence?.companyName?.value || row.entity.name;
          row.entity.name = preferredDisplayName({
            name: row.entity.name,
            officialName,
            domain: row.entity.domain,
            title: officialName
          });
          row.entity.displayName = row.entity.name;
          row.entity.description = description || null;
          const evidence = await this.graph.addEvidence({
            entityId: row.entity.entityId,
            objectiveId: request.objectiveId,
            sourceUrl,
            sourceType: 'FIRST_PARTY_WEB',
            excerpt: description || officialName,
            extractionMethod: verified.provenance?.extractionMethod || 'first-party-verification',
            query: request.question,
            provider: verified.provenance?.provider || 'public-web',
            trustClass: TRUST_CLASS.FIRST_PARTY
          });
          row.evidenceIds = [...new Set([...(row.evidenceIds || []), evidence.evidenceId])];
          row.firstParty = true;
          row.sourceRoles = [...new Set([...(row.sourceRoles || []), 'FIRST_PARTY_SOURCE', 'EVIDENCE_SOURCE'])];
        } catch (error) {
          errors.push({ provider: 'first-party-verification', entity: row.entity.name, error: error.message, kind: 'VERIFY_FAILURE' });
        }
      }
    };

    let unique = uniqueRows();
    await verifyFirstParty(unique);
    quality = evaluateResearch({
      question: request.question,
      requested: request.quantity,
      accepted: unique.map((u) => ({
        ...u.entity,
        organizationName: u.entity.name,
        website: u.entity.website,
        firstParty: u.firstParty,
        evidenceIds: u.evidenceIds,
        pageKind: u.classification?.pageKind
      })),
      rejected: buckets.rejected,
      evidence: unique.flatMap((u) => [u.evidence].filter(Boolean)),
      geography: hints.geography
    });

    let adaptationPasses = 0;
    while (
      (quality.classification === QUALITY.WEAK || quality.classification === QUALITY.FAILED)
      && adaptationPasses < request.maxAdaptations
      && Date.now() - startedAt < request.maxDurationMs
    ) {
      const proposed = proposeAdaptations({
        quality,
        request,
        previousQueries: queries,
        vocabulary,
        playbook: playbook.class
      });
      if (!proposed.length) break;
      adaptationPasses += 1;
      this.store?.bump?.('adaptationsTriggered');
      const chosen = proposed[0];
      const extraQueries = (chosen.queries || [])
        .filter((q) => isNovelQuery(q, queries))
        .map((q) => ({ query: q, reason: chosen.why, producedEvidence: [] }));
      if (!extraQueries.length && !(chosen.sourceTypes || []).includes('DIRECTORY')) break;
      queries.push(...extraQueries);
      adaptations.push({
        ...chosen,
        objectiveId: request.objectiveId,
        qualityBefore: quality.classification,
        at: new Date().toISOString()
      });
      await this.store?.put?.('adaptations', adaptations[adaptations.length - 1]);
      if (extraQueries.length) await runQueries(extraQueries);
      if (!extraQueries.length && this.discovery?.discover && (chosen.sourceTypes || []).includes('DIRECTORY')) {
        const fallback = await this.discovery.discover({
          query: request.question,
          maxOrganizations: request.quantity,
          location: hints.geography,
          industry: hints.industry
        }, context);
        for (const p of fallback.prospects || []) {
          const ingested = await this.considerItem({
            title: p.organizationName, url: p.website, snippet: p.description
          }, { request, query: request.question, provider: (fallback.providers || [])[0] }, buckets);
          if (ingested) findings.push(ingested);
        }
      }
      unique = uniqueRows();
      await verifyFirstParty(unique);
      const after = evaluateResearch({
        question: request.question,
        requested: request.quantity,
        accepted: unique.map((u) => ({
          ...u.entity,
          organizationName: u.entity.name,
          website: u.entity.website,
          firstParty: u.firstParty,
          evidenceIds: u.evidenceIds,
          pageKind: u.classification?.pageKind
        })),
        rejected: buckets.rejected,
        geography: hints.geography
      });
      adaptations[adaptations.length - 1].qualityAfter = after.classification;
      quality = after;
      if (quality.classification === QUALITY.STRONG || quality.classification === QUALITY.ACCEPTABLE) break;
      if (request.stopReason === 'diminishing unique entities') break;
    }

    unique = uniqueRows();
    const top = unique.slice(0, request.quantity);
    const gaps = quality.gaps?.length ? quality.gaps : [];
    if (top.length < request.quantity && !gaps.length) {
      gaps.push({
        type: 'quantity',
        requested: request.quantity,
        legitimateFound: top.length,
        gap: request.quantity - top.length,
        reason: request.stopReason || 'insufficient evidence',
        detail: `Requested ${request.quantity}, found ${top.length} legitimate entities. Not padded with junk.`
      });
    }

    const ranking = top.map((t, i) => ({
      rank: i + 1,
      ...rankingComponents(t.entity, request.question, {
        firstParty: t.firstParty,
        geography: hints.geography
      })
    }));

    recordPlaybookOutcome(this.store, playbook, {
      acceptedYield: top.length / Math.max(request.quantity, 1),
      noiseRatio: quality.dimensions?.noiseRatio,
      quality: quality.classification
    });

    const run = {
      runId: newId('run'),
      objectiveId: request.objectiveId,
      intelligenceRequestId: request.intelligenceRequestId,
      playbook: playbook.class,
      quality: quality.classification,
      dimensions: quality.dimensions,
      adaptations,
      queries: queries.map((q) => q.query),
      sourcesUsed: [...new Set(sourcesUsed)],
      accepted: top.length,
      rejected: buckets.rejected.length,
      vocabulary: vocabulary.slice(0, 8),
      discoveryPath,
      contacted: false,
      createdAt: new Date().toISOString()
    };
    await this.store?.put?.('runs', run);
    await this.store?.persistMetrics?.();

    const unknowns = [];
    if (!top.some((t) => /price|pricing|\$\d/i.test(t.entity.description || ''))) {
      unknowns.push({ predicate: 'pricing', status: 'OBSERVED_NOT_FOUND' });
    }

    return {
      status: top.length ? 'ok' : 'empty',
      request,
      queries,
      sourcesSelected: selected.map((s) => ({ sourceId: s.sourceId, provider: s.provider, reasonSelected: s.reasonSelected })),
      sourcesUsed: [...new Set(sourcesUsed)],
      sourcesAttempted: [...new Set(sourcesAttempted)],
      discoveryPath,
      entities: top.map((t) => t.entity),
      claims: top.flatMap((t) => t.claims || []),
      evidence: top.flatMap((t) => t.evidence || []),
      prospects: top.map((t) => ({
        organizationName: t.entity.displayName || t.entity.name,
        website: t.entity.website,
        domain: t.entity.domain,
        description: t.entity.description || null,
        entityId: t.entity.entityId,
        evidenceIds: t.evidenceIds,
        pageKind: t.classification?.pageKind,
        sourceRoles: t.sourceRoles || []
      })),
      top: top.slice(0, Math.min(5, top.length)).map((t) => t.entity),
      rejected: buckets.rejected.slice(0, 20).map((r) => ({
        title: r.title || r.organizationName,
        url: r.url || r.website,
        reason: r.reason || r.classification?.reasons?.join(',')
      })),
      quality,
      ranking,
      adaptations,
      vocabulary: vocabulary.slice(0, 8),
      playbook: playbook.class,
      unknowns,
      gaps,
      errors,
      stopReason: request.stopReason || (top.length >= request.quantity ? 'requested quantity reached' : 'search exhausted'),
      report: this.formatReport(request, top, gaps, queries, quality, adaptations),
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
      title: prospect.title || name,
      jsonLdName: prospect.jsonLdName,
      ogSiteName: prospect.ogSiteName,
      objectiveId: meta.request?.objectiveId,
      type: /app|platform|tracker|software|receptionist/i.test(`${name} ${prospect.description || ''}`)
        ? 'PRODUCT'
        : (meta.pageKind === 'PRODUCT' || meta.pageKind === 'APP' ? 'PRODUCT' : 'ORGANIZATION'),
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

  formatReport(request, top, gaps, queries, quality = null, adaptations = []) {
    const lines = [
      `Intelligence ${request.intent} · ${top.length} legitimate entities (requested ${request.quantity}).`,
      quality ? `Quality: ${quality.classification}` : null,
      `Queries: ${(queries || []).map((q) => q.query || q).join(' | ')}`,
      adaptations.length ? `Adaptations: ${adaptations.map((a) => a.kind).join(', ')}` : null,
      ...top.slice(0, 8).map((t, i) => {
        const ev = t.evidence?.sourceUrl || t.entity.website || 'n/a';
        return `#${i + 1} ${t.entity.displayName || t.entity.name} · ${t.entity.domain || 'no domain'} · ${ev}`;
      }),
      ...gaps.map((g) => `Gap: ${g.detail || g.reason}`),
      'Discovered prospects contacted: 0.'
    ].filter(Boolean);
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
