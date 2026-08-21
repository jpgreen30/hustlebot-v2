import test from 'node:test';
import assert from 'node:assert/strict';
import { SwarmOrchestrator } from './swarm.js';
import { createSpecialist, SPECIALIST_STATUS } from './specialist.js';
import { sourceRolesForClassification, RESULT_ROLE, PAGE_KIND } from '../intel/classify.js';
import { preferredDisplayName } from '../intel/names.js';
import { applyReplan } from './recover.js';

test('source roles let directories yield candidates without occupying entity slots', () => {
  const roles = sourceRolesForClassification({ role: RESULT_ROLE.SOURCE, pageKind: PAGE_KIND.DIRECTORY });
  assert.deepEqual(roles, ['EVIDENCE_SOURCE', 'DISCOVERY_SOURCE', 'DIRECTORY', 'AGGREGATOR']);
  assert.equal(roles.includes('ENTITY_SOURCE'), false);
});

test('canonical display name strips store and official-site suffixes', () => {
  assert.equal(preferredDisplayName({ name: 'Acme App App | App Store', officialName: 'Acme App', domain: 'acmeapp.com' }), 'Acme App');
});

test('repair refuses an unsupported objective-class change', () => {
  const repaired = applyReplan({ planId: 'p1', version: 1, pattern: 'local-business', nodes: [] }, {
    objectiveClass: 'product-landscape', reason: 'zero results'
  });
  assert.equal(repaired.objectiveClass, 'local-business');
  assert.equal(repaired.repairSafety.classChangeRefused, true);
});

test('swarm hard deadline returns and releases a hanging worker lease', async () => {
  const catalogue = [{
    capabilityId: 'org.discover', available: true, preferredProvider: 'hanging-test', providers: [{ provider: 'hanging-test', available: true }]
  }];
  const engine = {
    persist() {}, get() { return null; },
    invokeNode() { return new Promise(() => {}); },
    fabric: { healthOverlay: () => ({}) }
  };
  const orchestrator = new SwarmOrchestrator(engine, { maxConcurrentWorkers: 1, maxWorkersPerObjective: 2 });
  const objective = {
    objectiveId: 'obj_deadline', rawRequest: 'Research roofing companies in Los Angeles. Do not contact anyone.',
    context: { findN: 2, query: 'roofing companies Los Angeles', pattern: 'research_rank_search' },
    constraints: [], prohibitedCapabilities: [], successCriteria: [], cost: 0
  };
  const hanging = createSpecialist({ objective, catalogue, role: 'scout', mission: 'hang' });
  objective.specialists = [hanging];
  const started = Date.now();
  const result = await orchestrator.execute(objective, { delegate: true, slices: [] }, catalogue, {
    objectiveBudgetMs: 40, deadlineGraceMs: 10
  });
  assert.ok(Date.now() - started < 250, `deadline took ${Date.now() - started}ms`);
  assert.equal(result.objective.deadline.expired, true);
  assert.ok([SPECIALIST_STATUS.TIMED_OUT, SPECIALIST_STATUS.CANCELLED].includes(hanging.status));
  assert.ok(hanging.leaseReleasedAt);
  assert.equal(result.objective.contacted, false);
});
