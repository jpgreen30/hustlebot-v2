import { evaluateResearch, QUALITY } from '../intel/quality.js';
import { classifySearchResult, RESULT_ROLE } from '../intel/classify.js';

export function shouldRunCritic(objective, decision) {
  if (!decision?.delegate) return /landscape|apps?|platforms?|exhibitors?/i.test(objective?.rawRequest || '');
  const findN = Number(objective?.context?.findN || 0);
  const slices = decision.slices || [];
  return slices.length >= 2 || findN >= 8 || /opportunit|compar|landscape/i.test(objective?.rawRequest || '');
}

export function critique(objective = {}, findings = []) {
  const gaps = [];
  const minOrgs = (objective.successCriteria || []).find((s) => s.type === 'minOrganizations')?.value
    || Math.min(Number(objective.context?.findN || 3), 3);
  const list = Array.isArray(findings) ? findings : [];
  const question = objective.rawRequest || '';
  const occupying = [];
  const clean = [];
  for (const p of list) {
    const classified = classifySearchResult({
      title: p.organizationName || p.name,
      url: p.website || p.sourceUrl,
      snippet: p.description
    }, question);
    if (classified.role !== RESULT_ROLE.CANDIDATE) occupying.push({ ...p, classification: classified });
    else clean.push(p);
  }
  if (occupying.length) {
    gaps.push({
      type: 'wrong-entity-type',
      detail: `${occupying.length} listicles/directories/mirrors occupying candidate slots`,
      names: occupying.map((p) => p.organizationName || p.name).slice(0, 5)
    });
  }
  if (clean.length < minOrgs) {
    gaps.push({
      type: 'missing-organizations',
      need: minOrgs - clean.length,
      detail: `Need ${minOrgs} organizations, have ${clean.length} legitimate`
    });
  }
  const weak = clean.filter((p) => !p.website && !p.description);
  if (weak.length) {
    gaps.push({
      type: 'missing-evidence',
      organizations: weak.map((p) => p.organizationName || p.name).slice(0, 5),
      detail: `${weak.length} organizations lack website and description`
    });
  }
  const names = clean.map((p) => String(p.organizationName || p.name || '').toLowerCase().trim());
  const dupes = names.filter((n, i) => n && names.indexOf(n) !== i);
  if (dupes.length) {
    gaps.push({ type: 'duplicate-entities', names: [...new Set(dupes)] });
  }
  if ((objective.constraints || []).includes('do-not-contact')) {
    const leaked = list.some((p) => p.contacted === true || p.outreach === true);
    if (leaked) gaps.push({ type: 'constraint-violation', detail: 'contacted flag present despite do-not-contact' });
  }
  const quality = evaluateResearch({
    question,
    requested: Number(objective.context?.findN || 10),
    accepted: clean,
    rejected: occupying
  });
  if (quality.classification === QUALITY.WEAK || quality.classification === QUALITY.FAILED) {
    gaps.push({ type: 'weak-quality', detail: `Research quality ${quality.classification}`, quality });
  }
  if (quality.diversity?.concentration >= 0.6 && clean.length >= 3) {
    gaps.push({ type: 'monoculture', detail: quality.weaknesses.find((w) => w.type === 'monoculture')?.detail });
  }
  return {
    ok: gaps.filter((g) => g.type !== 'weak-quality').length === 0 && quality.classification !== QUALITY.FAILED,
    gaps,
    quality,
    clean,
    occupying,
    recommendRepair: gaps.find((g) =>
      g.type === 'missing-organizations' || g.type === 'wrong-entity-type' || g.type === 'weak-quality'
    ) || null
  };
}