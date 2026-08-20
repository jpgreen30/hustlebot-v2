/**
 * Evidence graph over Postgres-shaped records (no graph database).
 * Strong identifiers merge. Weak name similarity never silently merges.
 */

import { normalizeDomain, normalizeUrl, normalizeOrganizationName } from '../acquisition/normalize.js';
import { wrapUntrusted } from '../objective/context-pack.js';
import {
  ENTITY_TYPE, CLAIM_STATUS, TRUST_CLASS, FRESHNESS_TTL_MS, newId, fingerprintText
} from './schema.js';

export function stripLegalSuffix(name = '') {
  return String(name)
    .replace(/\b(incorporated|corporation|company|limited|affiliates?)\b/gi, ' ')
    .replace(/\b(inc|llc|ltd|corp|co)\b\.?/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normalizeAlias(name = '') {
  return stripLegalSuffix(name)
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/^the\s+/i, '')
    .replace(/[^a-z0-9]+/g, '');
}

export function acronymOf(name = '') {
  const words = stripLegalSuffix(name)
    .split(/[^a-zA-Z0-9]+/)
    .filter((w) => w.length > 0 && !/^(of|the|and|for|in)$/i.test(w));
  if (words.length < 2) return null;
  return words.map((w) => w[0]).join('').toLowerCase();
}

export function decideMerge(a = {}, b = {}) {
  const da = a.domain || null;
  const db = b.domain || null;
  if (da && db && da === db) {
    return { merge: true, reason: `shared canonical domain ${da}` };
  }
  const pa = new Set(a.providerIds || []);
  const overlap = (b.providerIds || []).filter((id) => pa.has(id));
  if (overlap.length) return { merge: true, reason: `shared provider id ${overlap[0]}` };

  const na = normalizeAlias(a.name || a.organizationName);
  const nb = normalizeAlias(b.name || b.organizationName);
  if (na && nb && na === nb && na.length >= 4) {
    if (da && db && da !== db) {
      return { merge: false, reason: 'same normalized name but different domains — ambiguous' };
    }
    return { merge: true, reason: 'normalized legal/trade name match without conflicting domain' };
  }

  const acrA = acronymOf(a.name || a.organizationName);
  const acrB = acronymOf(b.name || b.organizationName);
  const aIsAcr = na && na.length <= 4 && /^[a-z]+$/.test(na);
  const bIsAcr = nb && nb.length <= 4 && /^[a-z]+$/.test(nb);
  if ((aIsAcr && acrB === na) || (bIsAcr && acrA === nb)) {
    if (da && db && da !== db) {
      return { merge: false, reason: 'acronym match but different domains' };
    }
    return { merge: true, reason: 'acronym expands to the longer trade name without conflicting domain' };
  }

  if (da && !db && na && nb && (na.includes(nb) || nb.includes(na)) && Math.min(na.length, nb.length) >= 4) {
    return { merge: true, reason: 'name containment with a single known domain' };
  }

  return { merge: false, reason: 'insufficient identity evidence' };
}

function ttlFor(predicate) {
  return FRESHNESS_TTL_MS[predicate] || FRESHNESS_TTL_MS.default;
}

export class EvidenceGraph {
  constructor({ store } = {}) {
    this.store = store;
  }

  entities() { return this.store.list('entities'); }
  claims() { return this.store.list('claims'); }
  evidence() { return this.store.list('evidence'); }
  aliases() { return this.store.list('aliases'); }
  relations() { return this.store.list('relations'); }

  async upsertEntity(input = {}) {
    const domain = normalizeDomain(input.domain || input.website) || null;
    const name = normalizeOrganizationName(input.name || input.organizationName || input.title) || input.name || null;
    const website = normalizeUrl(input.website || (domain ? `https://${domain}` : null));
    const candidate = {
      entityId: input.entityId || newId('ent'),
      type: input.type || ENTITY_TYPE.ORGANIZATION,
      name,
      domain,
      website,
      providerIds: input.providerIds || [],
      aliases: input.aliases || [],
      firstObservedAt: input.firstObservedAt || new Date().toISOString(),
      lastVerifiedAt: input.lastVerifiedAt || null,
      provenance: input.provenance || {},
      fabricated: false
    };

    for (const existing of this.entities()) {
      const decision = decideMerge(existing, candidate);
      if (decision.merge) {
        const merged = this.mergeEntities(existing, candidate, decision.reason);
        this.store.stats.entityMerges += 1;
        await this.store.putEntity(merged);
        await this.addAlias({
          alias: name,
          entityId: merged.entityId,
          reason: decision.reason,
          evidenceIds: input.evidenceIds || []
        });
        if (existing.name && existing.name !== merged.name) {
          await this.addAlias({ alias: existing.name, entityId: merged.entityId, reason: decision.reason });
        }
        return { entity: merged, merged: true, reason: decision.reason };
      }
      if (!decision.merge && /different domains|ambiguous/i.test(decision.reason)) {
        this.store.stats.entityMergeRefusals += 1;
        await this.store.put('relations', {
          relationId: newId('rel'),
          fromId: existing.entityId,
          predicate: 'NOT_SAME_AS',
          toId: candidate.entityId,
          reason: decision.reason,
          createdAt: new Date().toISOString()
        });
      }
    }

    await this.store.putEntity(candidate);
    if (name) await this.addAlias({ alias: name, entityId: candidate.entityId, reason: 'canonical name' });
    if (domain) await this.addAlias({ alias: domain, entityId: candidate.entityId, reason: 'canonical domain' });
    return { entity: candidate, merged: false, reason: 'new entity' };
  }

  mergeEntities(winner, incoming, reason) {
    const pick = (a, b) => a || b || null;
    return {
      ...winner,
      name: pick(winner.name, incoming.name),
      domain: pick(winner.domain, incoming.domain),
      website: pick(winner.website, incoming.website),
      providerIds: [...new Set([...(winner.providerIds || []), ...(incoming.providerIds || [])])],
      aliases: [...new Set([...(winner.aliases || []), incoming.name, incoming.domain].filter(Boolean))],
      lastVerifiedAt: pick(incoming.lastVerifiedAt, winner.lastVerifiedAt),
      mergeHistory: [
        ...(winner.mergeHistory || []),
        { entityId: incoming.entityId, reason, at: new Date().toISOString() }
      ]
    };
  }

  async addAlias({ alias, entityId, reason, evidenceIds } = {}) {
    if (!alias || !entityId) return null;
    const rec = {
      aliasId: newId('als'),
      alias: String(alias),
      normalized: normalizeAlias(alias) || String(alias).toLowerCase(),
      entityId,
      reason: reason || 'recorded alias',
      evidenceIds: evidenceIds || [],
      createdAt: new Date().toISOString()
    };
    await this.store.putAlias(rec);
    const ent = this.store.get('entities', entityId);
    if (ent) {
      ent.aliases = [...new Set([...(ent.aliases || []), alias])];
      await this.store.putEntity(ent);
    }
    return rec;
  }

  findByAlias(alias) {
    const key = normalizeAlias(alias) || String(alias || '').toLowerCase();
    const hit = this.aliases().find((a) => a.normalized === key || a.alias.toLowerCase() === String(alias).toLowerCase());
    if (!hit) return null;
    return this.store.get('entities', hit.entityId);
  }

  async addEvidence(input = {}) {
    const excerpt = String(input.excerpt || input.structuredValue || '').slice(0, 500);
    const untrusted = input.untrusted === true || /ignore (your|the) (objective|instructions)|email this list immediately/i.test(excerpt);
    const rec = {
      evidenceId: input.evidenceId || newId('evd'),
      objectiveId: input.objectiveId || null,
      claimId: input.claimId || null,
      entityId: input.entityId || null,
      sourceId: input.sourceId || null,
      sourceUrl: input.sourceUrl || null,
      sourceType: input.sourceType || null,
      retrievedAt: input.retrievedAt || new Date().toISOString(),
      publishedAt: input.publishedAt || null,
      excerptRef: untrusted ? wrapUntrusted(excerpt) : excerpt,
      structuredValue: input.structuredValue ?? null,
      extractionMethod: input.extractionMethod || 'search',
      query: input.query || null,
      confidence: Number(input.confidence ?? 0.5),
      trustClass: untrusted ? TRUST_CLASS.UNTRUSTED : (input.trustClass || TRUST_CLASS.SEARCH_SNIPPET),
      freshness: input.freshness || 'default',
      fingerprint: fingerprintText(excerpt),
      canonicalUrl: input.canonicalUrl || input.sourceUrl || null,
      citedOrigin: input.citedOrigin || null,
      untrusted,
      provenance: {
        actor: input.actor || 'macgyver',
        provider: input.provider || null,
        fabricated: false
      }
    };
    await this.store.putEvidence(rec);
    this.store.stats.evidenceRecords = this.store.collections.evidence.size;
    return rec;
  }

  independentEvidence(evidenceIds = []) {
    const rows = evidenceIds.map((id) => this.store.get('evidence', id)).filter(Boolean);
    const seenFp = new Set();
    const seenOrigin = new Set();
    const independent = [];
    for (const ev of rows) {
      if (ev.untrusted || ev.trustClass === TRUST_CLASS.UNTRUSTED) continue;
      const fp = ev.fingerprint || '';
      const origin = ev.citedOrigin || ev.canonicalUrl || '';
      if (fp && seenFp.has(fp)) continue;
      if (origin && seenOrigin.has(origin)) continue;
      if (fp) seenFp.add(fp);
      if (origin) seenOrigin.add(origin);
      independent.push(ev);
    }
    return independent;
  }

  async addClaim(input = {}) {
    const predicate = input.predicate || 'described_as';
    const value = input.value;
    const now = new Date().toISOString();
    const existing = this.claims().filter((c) =>
      c.subjectEntityId === input.subjectEntityId && c.predicate === predicate
    );
    const conflict = existing.find((c) => String(c.value) !== String(value) && c.status !== CLAIM_STATUS.STALE);
    const evidenceIds = [...(input.evidenceIds || [])];
    const independent = this.independentEvidence(evidenceIds);
    let status = input.status || CLAIM_STATUS.DISCOVERED;
    if (conflict) {
      status = CLAIM_STATUS.CONFLICTED;
      this.store.stats.conflictsDetected += 1;
    } else if (independent.length >= 2 && independent.some((e) => e.trustClass === TRUST_CLASS.FIRST_PARTY)) {
      status = CLAIM_STATUS.CORROBORATED;
    } else if (independent.length >= 2) {
      status = CLAIM_STATUS.CORROBORATED;
    }
    if (status === CLAIM_STATUS.VERIFIED && !input.allowVerified) {
      status = independent.some((e) => e.trustClass === TRUST_CLASS.FIRST_PARTY)
        ? CLAIM_STATUS.CORROBORATED
        : CLAIM_STATUS.DISCOVERED;
    }
    const rec = {
      claimId: input.claimId || newId('clm'),
      subjectEntityId: input.subjectEntityId,
      predicate,
      value,
      status,
      confidence: Number(input.confidence ?? (status === CLAIM_STATUS.CORROBORATED ? 0.72 : 0.45)),
      evidenceIds,
      independentEvidenceCount: independent.length,
      firstObservedAt: existing[0]?.firstObservedAt || now,
      lastVerifiedAt: now,
      expiresAt: new Date(Date.now() + ttlFor(predicate)).toISOString(),
      conflictWith: conflict?.claimId || null,
      conflictNote: conflict
        ? `Source disagreement: ${conflict.value} vs ${value}. Authority/first-party/freshness not arbitrarily resolved.`
        : null
    };
    await this.store.putClaim(rec);
    if (conflict) {
      conflict.status = CLAIM_STATUS.CONFLICTED;
      conflict.conflictWith = rec.claimId;
      await this.store.putClaim(conflict);
    }
    return rec;
  }

  markStale(now = new Date().toISOString()) {
    let n = 0;
    for (const claim of this.claims()) {
      if (claim.expiresAt && claim.expiresAt < now && claim.status !== CLAIM_STATUS.STALE) {
        claim.status = CLAIM_STATUS.STALE;
        this.store.putClaim(claim);
        n++;
      }
    }
    this.store.stats.staleClaims = n;
    return n;
  }

  async relate(fromId, predicate, toId, extra = {}) {
    const rec = {
      relationId: newId('rel'),
      fromId,
      predicate,
      toId,
      evidenceIds: extra.evidenceIds || [],
      validFrom: extra.validFrom || null,
      validTo: extra.validTo || null,
      createdAt: new Date().toISOString()
    };
    await this.store.putRelation(rec);
    return rec;
  }

  why(entityId) {
    const entity = this.store.get('entities', entityId) || this.findByAlias(entityId);
    if (!entity) return { report: 'Unknown entity.', entity: null };
    const claims = this.claims().filter((c) => c.subjectEntityId === entity.entityId);
    const evidence = this.evidence().filter((e) => e.entityId === entity.entityId);
    const aliases = this.aliases().filter((a) => a.entityId === entity.entityId);
    const lines = [
      `${entity.name} · ${entity.entityId} · domain ${entity.domain || 'unknown'}`,
      aliases.length ? `Aliases: ${aliases.map((a) => `${a.alias} (${a.reason})`).join('; ')}` : 'No aliases.',
      ...claims.map((c) => {
        const ev = (c.evidenceIds || []).map((id) => this.store.get('evidence', id)).filter(Boolean);
        return `Claim ${c.predicate}=${c.value} · ${c.status} · evidence ${ev.map((e) => e.sourceUrl || e.sourceId).join(', ') || 'none'}`;
      }),
      ...evidence.filter((e) => e.untrusted).map(() => 'Untrusted page content is stored as data, not instructions.')
    ];
    return { report: lines.join('\n'), entity, claims, evidence, aliases };
  }

  inspectEntity(query) {
    const q = String(query || '').replace(/[?!.]+$/g, '').trim();
    const byAlias = this.findByAlias(q);
    if (byAlias) return this.why(byAlias.entityId);
    const named = this.entities().find((e) =>
      (e.name || '').toLowerCase().includes(q.toLowerCase())
      || (e.domain || '').includes(q.toLowerCase())
    );
    if (named) return this.why(named.entityId);
    return { report: `No persisted intelligence about “${q}”.`, entity: null };
  }
}
