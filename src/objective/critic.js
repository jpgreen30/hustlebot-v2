/**
 * Quality gate. Runs only for sufficiently complex delegated objectives.
 * Cannot override safety or ApprovalGate.
 */

export function shouldRunCritic(objective, decision) {
  if (!decision?.delegate) return false;
  const findN = Number(objective?.context?.findN || 0);
  const slices = decision.slices || [];
  return slices.length >= 2 || findN >= 12 || /opportunit|compar/i.test(objective?.rawRequest || '');
}

export function critique(objective = {}, findings = []) {
  const gaps = [];
  const minOrgs = (objective.successCriteria || []).find((s) => s.type === 'minOrganizations')?.value
    || Math.min(Number(objective.context?.findN || 3), 3);
  const list = Array.isArray(findings) ? findings : [];
  if (list.length < minOrgs) {
    gaps.push({
      type: 'missing-organizations',
      need: minOrgs - list.length,
      detail: `Need ${minOrgs} organizations, have ${list.length}`
    });
  }
  const weak = list.filter((p) => !p.website && !p.description);
  if (weak.length) {
    gaps.push({
      type: 'missing-evidence',
      organizations: weak.map((p) => p.organizationName || p.name).slice(0, 5),
      detail: `${weak.length} organizations lack website and description`
    });
  }
  const names = list.map((p) => String(p.organizationName || p.name || '').toLowerCase().trim());
  const dupes = names.filter((n, i) => n && names.indexOf(n) !== i);
  if (dupes.length) {
    gaps.push({ type: 'duplicate-entities', names: [...new Set(dupes)] });
  }
  if ((objective.constraints || []).includes('do-not-contact')) {
    const leaked = list.some((p) => p.contacted === true || p.outreach === true);
    if (leaked) gaps.push({ type: 'constraint-violation', detail: 'contacted flag present despite do-not-contact' });
  }
  return {
    ok: gaps.length === 0,
    gaps,
    recommendRepair: gaps.find((g) => g.type === 'missing-organizations' || g.type === 'missing-evidence') || null
  };
}
