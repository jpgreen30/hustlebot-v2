export const INTEL_CONTROL = [
  { action: 'why-ranked', re: /why is (this|the) company ranked|why (is|was) .+ ranked|#1|rank(?:ed)? #?1/i },
  { action: 'sources-used', re: /what sources did you use|which sources|show (me )?sources/i },
  { action: 'show-evidence', re: /show me the evidence|what(?:'s| is) the evidence|evidence for/i },
  { action: 'uncertain', re: /which facts are uncertain|what is unknown|what(?:'s| is) uncertain/i },
  { action: 'conflicts', re: /what conflicts did you find|show (me )?conflicts|contradict/i },
  { action: 'last-verified', re: /when was this last verified|last verified/i },
  { action: 'research-deeper', re: /research this deeper|go deeper|dig deeper/i },
  { action: 'another-source', re: /find another source|try another source/i },
  { action: 'verify-claim', re: /verify this claim|verify that/i },
  { action: 'know-about', re: /what do you know about\s+(.+)/i },
  { action: 'research-quality', re: /how good is this research|research quality|quality (of|for) this/i },
  { action: 'why-searched', re: /why did you search that|why (those|these) quer/i },
  { action: 'why-adapted', re: /why did you change (your )?research strategy|why (did you )?adapt/i },
  { action: 'rejected-results', re: /which results did you reject|what did you reject|rejected results/i },
  { action: 'why-rejected', re: /why was this result rejected|why reject/i },
  { action: 'still-missing', re: /what are we still missing|what(?:'s| is) missing/i },
  { action: 'best-source', re: /what source performed best|best source/i },
  { action: 'first-party-only', re: /show only first-party evidence|first-party evidence/i },
  { action: 'inferred-claims', re: /which claims are inferred|inferred claims/i },
  { action: 'learned-strategy', re: /what did you learn from this research|learned strategy/i }
];

export function matchIntelControl(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  for (const item of INTEL_CONTROL) {
    const m = value.match(item.re);
    if (m) return { action: item.action, query: value, captured: m[1] || null };
  }
  return null;
}

function scoped(graph, record) {
  if (record?.objectiveId && graph.objectiveSnapshot) {
    return graph.objectiveSnapshot(record.objectiveId);
  }
  return null;
}

export function formatIntelReply(fabric, record, matched) {
  const graph = fabric?.graph;
  if (!graph) return { status: 'empty', report: 'Intelligence fabric not initialized.' };
  const action = matched?.action;
  const top = record?.result?.top || record?.result?.prospects || [];
  const first = top[0];
  const snap = scoped(graph, record);
  const run = record?.result?.quality ? record.result : (snap?.run || null);
  const graphWide = /across all|graph-wide|everything you know|all research/i.test(matched?.query || '');

  if (action === 'why-ranked') {
    if (!first) return { status: 'ok', report: 'No ranked entity is loaded.' };
    const why = graph.why(first.entityId || first.organizationName || first.name);
    const rank = (record?.result?.ranking || [])[0];
    const extra = rank
      ? `\nRanking: relevance ${rank.relevance}; type ${rank.entityTypeFit}; first-party ${rank.firstPartyEvidence}; completeness ${rank.evidenceCompleteness}.`
      : '';
    return { status: 'ok', report: `Rank #1 is ${first.organizationName || first.name}.${extra}\n${why.report}` };
  }
  if (action === 'sources-used') {
    if (!graphWide && (record || snap)) {
      const used = record?.result?.sourcesUsed || record?.intel?.sourcesUsed || snap?.sources || [];
      const urls = (snap?.evidence || []).map((e) => e.sourceUrl).filter(Boolean);
      return {
        status: 'ok',
        scope: record?.objectiveId || 'objective',
        report: `Objective ${record?.objectiveId || 'latest'} sources: ${(Array.isArray(used) ? used : []).join(', ') || 'none recorded'}\n${urls.slice(0, 8).join('\n') || 'No objective-scoped evidence URLs.'}`
      };
    }
    const used = record?.result?.sourcesUsed || [];
    const evidence = graph.evidence().slice(-12);
    return {
      status: 'ok',
      scope: 'graph',
      report: `Graph-wide sources (explicit): ${used.join(', ') || 'n/a'}\n${evidence.map((e) => e.sourceUrl).filter(Boolean).slice(0, 8).join('\n')}`
    };
  }
  if (action === 'show-evidence') {
    if (snap?.evidence?.length && !graphWide) {
      return {
        status: 'ok',
        report: snap.evidence.slice(0, 10).map((e) => `${e.sourceUrl || e.sourceId} · ${String(e.excerptRef || '').slice(0, 120)}`).join('\n')
      };
    }
    const target = first?.entityId || first?.organizationName;
    const why = target ? graph.why(target) : graph.inspectEntity(matched.query);
    return { status: 'ok', report: why.report };
  }
  if (action === 'uncertain') {
    const claims = (snap?.claims || graph.claims()).filter((c) =>
      c.status === 'UNKNOWN' || c.status === 'DISCOVERED' || c.status === 'STALE' || c.status === 'INFERRED'
    );
    return {
      status: 'ok',
      report: claims.length
        ? claims.slice(0, 12).map((c) => `${c.predicate}=${c.value} · ${c.status}`).join('\n')
        : 'No uncertain claims recorded.'
    };
  }
  if (action === 'conflicts') {
    const conflicts = (snap?.claims || graph.claims()).filter((c) => c.status === 'CONFLICTED');
    return {
      status: 'ok',
      report: conflicts.length
        ? conflicts.map((c) => c.conflictNote || `${c.predicate} conflict`).join('\n')
        : 'No conflicts recorded.'
    };
  }
  if (action === 'last-verified') {
    const claims = (snap?.claims || graph.claims()).sort((a, b) => String(b.lastVerifiedAt).localeCompare(String(a.lastVerifiedAt)));
    const last = claims[0];
    return { status: 'ok', report: last ? `Last claim verification ${last.lastVerifiedAt} (${last.predicate})` : 'Nothing verified yet.' };
  }
  if (action === 'know-about') {
    return { status: 'ok', ...graph.inspectEntity(matched.captured || matched.query) };
  }
  if (action === 'research-quality') {
    const q = record?.result?.quality || run?.quality;
    if (!q) return { status: 'ok', report: 'No quality evaluation stored for this objective.' };
    const cls = q.classification || q;
    const dims = q.dimensions || {};
    return {
      status: 'ok',
      report: [
        `Research quality: ${cls}`,
        `Legitimate ${q.legitimateFound ?? record?.result?.prospects?.length ?? 0} / requested ${q.requested ?? record?.context?.findN ?? '?'}`,
        Object.entries(dims).slice(0, 8).map(([k, v]) => `${k}: ${typeof v === 'number' ? v.toFixed(2) : v}`).join('\n')
      ].join('\n')
    };
  }
  if (action === 'why-searched') {
    const queries = record?.result?.queries || run?.queries || [];
    const list = queries.map((q) => (q.query ? `${q.query} (${q.reason || ''})` : q));
    return { status: 'ok', report: list.length ? `Queries:\n${list.join('\n')}` : 'No queries recorded for this objective.' };
  }
  if (action === 'why-adapted') {
    const ads = record?.result?.adaptations || snap?.adaptations || [];
    if (!ads.length) return { status: 'ok', report: 'No strategy adaptation was required (or none recorded).' };
    return {
      status: 'ok',
      report: ads.map((a) => `${a.kind}: ${a.why} (${a.qualityBefore || '?'} → ${a.qualityAfter || '?'})`).join('\n')
    };
  }
  if (action === 'rejected-results' || action === 'why-rejected') {
    const rejected = record?.result?.rejected || [];
    if (!rejected.length) return { status: 'ok', report: 'No rejected results recorded for this objective.' };
    return {
      status: 'ok',
      report: rejected.slice(0, 12).map((r) => `${r.title || r.url} — ${r.reason}`).join('\n')
    };
  }
  if (action === 'still-missing') {
    const gaps = record?.result?.gaps || record?.result?.quality?.gaps || [];
    const unk = record?.result?.unknowns || [];
    return {
      status: 'ok',
      report: [...gaps.map((g) => g.detail || g.reason), ...unk.map((u) => `${u.predicate}: ${u.status}`)].join('\n') || 'No gaps recorded.'
    };
  }
  if (action === 'best-source') {
    const used = record?.result?.sourcesUsed || [];
    return { status: 'ok', report: used[0] ? `Best recorded source for this objective: ${used[0]}` : 'No source yield recorded.' };
  }
  if (action === 'first-party-only') {
    const ev = (snap?.evidence || graph.evidence()).filter((e) => e.trustClass === 'FIRST_PARTY');
    return {
      status: 'ok',
      report: ev.length ? ev.slice(0, 10).map((e) => e.sourceUrl).join('\n') : 'No first-party evidence in this objective.'
    };
  }
  if (action === 'inferred-claims') {
    const inferred = (snap?.claims || graph.claims()).filter((c) => c.status === 'INFERRED');
    return {
      status: 'ok',
      report: inferred.length ? inferred.map((c) => `${c.predicate}=${c.value}`).join('\n') : 'No inferred claims.'
    };
  }
  if (action === 'learned-strategy') {
    const pb = record?.result?.playbook || run?.playbook;
    const ads = record?.result?.adaptations || [];
    return {
      status: 'ok',
      report: `Playbook ${pb || 'none'}. Adaptations ${ads.length}. Quality ${record?.result?.quality?.classification || 'n/a'}.`
    };
  }
  return null;
}
