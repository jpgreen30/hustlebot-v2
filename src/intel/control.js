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
  { action: 'know-about', re: /what do you know about\s+(.+)/i }
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

export function formatIntelReply(fabric, record, matched) {
  const graph = fabric?.graph;
  if (!graph) return { status: 'empty', report: 'Intelligence fabric not initialized.' };
  const action = matched?.action;
  const top = record?.result?.top || record?.result?.prospects || [];
  const first = top[0];

  if (action === 'why-ranked') {
    if (!first) return { status: 'ok', report: 'No ranked entity is loaded.' };
    const why = graph.why(first.entityId || first.organizationName || first.name);
    return { status: 'ok', report: `Rank #1 is ${first.organizationName || first.name}.\n${why.report}` };
  }
  if (action === 'sources-used') {
    const used = record?.result?.sourcesUsed || record?.intel?.sourcesUsed || [];
    const evidence = graph.evidence().slice(-12);
    const urls = evidence.map((e) => e.sourceUrl).filter(Boolean);
    return {
      status: 'ok',
      report: `Sources used: ${used.join(', ') || 'none recorded'}\n${urls.slice(0, 8).join('\n') || 'No evidence URLs.'}`
    };
  }
  if (action === 'show-evidence') {
    const target = first?.entityId || first?.organizationName;
    const why = target ? graph.why(target) : graph.inspectEntity(matched.query);
    return { status: 'ok', report: why.report };
  }
  if (action === 'uncertain') {
    const unknown = graph.claims().filter((c) => c.status === 'UNKNOWN' || c.status === 'DISCOVERED' || c.status === 'STALE');
    return {
      status: 'ok',
      report: unknown.length
        ? unknown.map((c) => `${c.predicate}=${c.value} · ${c.status}`).join('\n')
        : 'No uncertain claims recorded.'
    };
  }
  if (action === 'conflicts') {
    const conflicts = graph.claims().filter((c) => c.status === 'CONFLICTED');
    return {
      status: 'ok',
      report: conflicts.length
        ? conflicts.map((c) => c.conflictNote || `${c.predicate} conflict`).join('\n')
        : 'No conflicts recorded.'
    };
  }
  if (action === 'last-verified') {
    const claims = graph.claims().sort((a, b) => String(b.lastVerifiedAt).localeCompare(String(a.lastVerifiedAt)));
    const last = claims[0];
    return { status: 'ok', report: last ? `Last claim verification ${last.lastVerifiedAt} (${last.predicate})` : 'Nothing verified yet.' };
  }
  if (action === 'know-about') {
    return { status: 'ok', ...graph.inspectEntity(matched.captured || matched.query) };
  }
  return null;
}
