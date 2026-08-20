/**
 * Evidence-first arbitration. Majority vote never wins on its own.
 */

function sourceRank(item = {}) {
  const website = String(item.website || item.url || '');
  const domain = String(item.domain || '').replace(/^www\./, '');
  let host = '';
  try { host = new URL(website).hostname.replace(/^www\./, ''); } catch { host = ''; }
  if (host && domain && host === domain) return 3;
  if (website && !/(yelp|yellowpages|angi|bbb|directory)/i.test(website)) return 2;
  if (item.provenance?.provider === 'public-web' || item.provider === 'public-web') return 2;
  if (/(yelp|yellowpages|directory|angi)/i.test(website)) return 1;
  return 0;
}

function keyOf(item = {}) {
  return String(item.domain || item.website || item.organizationName || item.name || '')
    .toLowerCase()
    .replace(/^www\./, '')
    .trim();
}

export function arbitrate(results = []) {
  const merged = new Map();
  const conflicts = [];

  for (const packet of results) {
    const specialistId = packet.specialistId;
    const findings = packet.result?.findings || packet.findings || [];
    for (const item of findings) {
      const key = keyOf(item);
      if (!key) continue;
      const incoming = { ...item, _rank: sourceRank(item), _from: specialistId };
      if (!merged.has(key)) {
        merged.set(key, incoming);
        continue;
      }
      const current = merged.get(key);
      const field = 'description';
      const a = String(current[field] || '');
      const b = String(incoming[field] || '');
      if (a && b && a !== b) {
        const winner = incoming._rank > current._rank ? incoming : current;
        const loser = winner === incoming ? current : incoming;
        conflicts.push({
          key,
          field,
          a: { value: current[field], from: current._from, rank: current._rank },
          b: { value: incoming[field], from: incoming._from, rank: incoming._rank },
          resolution: incoming._rank === current._rank
            ? 'unresolved-uncertainty'
            : `preferred rank ${winner._rank} from ${winner._from} over ${loser._from} (first-party/source quality, not majority)`
        });
        if (incoming._rank === current._rank) {
          current.unknowns = [...(current.unknowns || []), `conflicting ${field}`];
        } else {
          merged.set(key, winner);
        }
      } else if (incoming._rank > current._rank) {
        merged.set(key, { ...current, ...incoming });
      }
    }
  }

  const findings = [...merged.values()].map((item) => {
    const { _rank, _from, ...rest } = item;
    return { ...rest, provenance: { ...(rest.provenance || {}), arbitrator: { rank: _rank, from: _from } } };
  });

  return {
    findings,
    conflicts,
    method: 'source-quality',
    note: 'Disagreements are resolved by provenance rank (first-party site > public web > directory). Majority vote is not used.'
  };
}
