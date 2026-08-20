/**
 * MacGyver objective engine.
 * Plans from the live capability catalogue, executes a DAG, observes,
 * recovers, and remembers. Does not call campaign.prepare for research goals.
 */

import { randomUUID } from 'node:crypto';
import logger from '../utils/logger.js';
import { resolveRefs } from '../core/execution-graph.js';
import { inspectCatalogue, isOutboundCapability } from './catalogue.js';
import { interpretObjective } from './interpret.js';
import { planObjective, explainPlan } from './planner.js';
import { validatePlan } from './validate.js';
import { observeNodeResult, OBSERVATION } from './observer.js';
import { recoveryAction, applyReplan } from './recover.js';
import { ObjectiveMemory } from './memory.js';
import { suggestStrategy } from './strategy.js';
import { OBJECTIVE_STATUS, compactObjective } from './schema.js';
import { formatObjectiveReply, matchObjectiveControl } from './control.js';

export class MacGyverEngine {
  constructor({
    registry,
    approvalGate,
    n8n,
    memory,
    email
  } = {}) {
    this.registry = registry;
    this.approvalGate = approvalGate;
    this.n8n = n8n;
    this.email = email || null;
    this.memory = memory || new ObjectiveMemory();
    this.objectives = new Map();
  }

  isAvailable() {
    return Boolean(this.registry);
  }

  persist(record) {
    record.updatedAt = new Date().toISOString();
    this.objectives.set(record.objectiveId, record);
    this.memory.save(this.safeRecord(record));
    return record;
  }

  safeRecord(record) {
    const copy = JSON.parse(JSON.stringify(record));
    return copy;
  }

  get(id) {
    if (!id || id === 'latest') return this.latest();
    return this.objectives.get(id) || this.memory.get(id);
  }

  latest() {
    return [...this.objectives.values()].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)))[0]
      || this.memory.list(1)[0]
      || null;
  }

  list(limit = 10) {
    const live = [...this.objectives.values()].map(compactObjective);
    if (live.length) return live.slice(0, limit);
    return this.memory.list(limit).map(compactObjective);
  }

  catalogue(options) {
    return inspectCatalogue(this.registry, options);
  }

  async run(input = {}) {
    const started = this.begin(input);
    return started.promise;
  }

  begin(input = {}) {
    const startedAt = Date.now();
    const objective = interpretObjective(input.rawRequest || input.objective || input.query, input);
    objective.status = OBJECTIVE_STATUS.DRAFT;
    this.persist(objective);
    const promise = this._executeStarted(objective, input, startedAt);
    return { objective, promise };
  }

  async _executeStarted(objective, input = {}, startedAt = Date.now()) {
    const catalogue = this.catalogue({ availableOnly: true });
    const strategy = suggestStrategy(objective, this.memory.list(20));
    objective.strategy = strategy;

    let plan;
    try {
      plan = planObjective(objective, catalogue);
    } catch (error) {
      objective.status = OBJECTIVE_STATUS.FAILED;
      objective.error = error.message;
      this.persist(objective);
      return { status: 'failed', objective, error: error.message };
    }

    const validation = validatePlan(plan, { catalogue, objective, registry: this.registry });
    if (!validation.ok) {
      objective.status = OBJECTIVE_STATUS.FAILED;
      objective.error = validation.errors.join('; ');
      objective.plan = plan;
      this.persist(objective);
      return { status: 'failed', objective, error: objective.error, validation };
    }

    objective.status = OBJECTIVE_STATUS.VALIDATED;
    objective.planId = plan.planId;
    objective.plan = plan;
    objective.planRevisions = [{ version: 1, reason: 'initial', at: new Date().toISOString() }];
    objective.replanCount = 0;
    objective.executions = [];
    objective.cost = 0;
    this.persist(objective);

    if (input.planOnly) {
      return { status: 'planned', objective, plan, validation, strategy };
    }

    const result = await this.executePlan(objective, plan, catalogue, input);
    result.durationMs = Date.now() - startedAt;
    return result;
  }

  async executePlan(objective, plan, catalogue, input = {}) {
    objective.status = OBJECTIVE_STATUS.RUNNING;
    this.persist(objective);
    const outputs = {};
    const completed = new Set();
    const context = {
      actor: input.actor || 'macgyver',
      permissions: input.permissions || ['network.read', 'data.read', 'data.write', 'external.send', 'telephony'],
      bypassPermissions: input.bypassPermissions !== false,
      forceUnavailable: input.forceUnavailable || [],
      vertical: input.vertical,
      allowFallback: true
    };

    const order = this.levels(plan.nodes);
    for (const level of order) {
      if (objective.status === OBJECTIVE_STATUS.CANCELLED) break;
      for (const node of level) {
        if (node.status === 'completed' || node.status === 'partial') {
          outputs[node.id] = node.result;
          completed.add(node.id);
          continue;
        }
        const blocked = (node.dependsOn || []).filter((id) => !completed.has(id));
        if (blocked.length) {
          node.status = 'skipped';
          node.error = `dependencies incomplete: ${blocked.join(', ')}`;
          objective.executions.push(this.executionRecord(objective, plan, node, { success: false, error: node.error }));
          continue;
        }

        if (isOutboundCapability(node.capabilityId) && (objective.constraints || []).includes('do-not-contact')) {
          node.status = 'blocked';
          node.error = 'outbound blocked by do-not-contact';
          objective.status = OBJECTIVE_STATUS.BLOCKED;
          this.persist(objective);
          return { status: 'blocked', objective, error: node.error };
        }

        if (isOutboundCapability(node.capabilityId) || node.approvalState === 'required') {
          const gate = await this.requireApproval(objective, plan, node, context);
          if (!gate.allowed) {
            node.status = 'awaiting_approval';
            node.approvalId = gate.approvalId;
            objective.status = OBJECTIVE_STATUS.AWAITING_APPROVAL;
            objective.approvalId = gate.approvalId;
            this.persist(objective);
            return {
              status: 'awaiting_approval',
              objective,
              approvalId: gate.approvalId,
              report: gate.report
            };
          }
          node.approvalId = gate.approvalId;
        }

        let resolvedInputs;
        try {
          resolvedInputs = resolveRefs(node.inputs || {}, outputs);
        } catch (error) {
          node.status = 'failed';
          node.error = error.message;
          objective.executions.push(this.executionRecord(objective, plan, node, { success: false, error: error.message }));
          continue;
        }

        const invocation = await this.invokeNode(node, resolvedInputs, context);
        const observation = observeNodeResult(node, invocation);
        node.observation = observation;
        node.provider = invocation.provider || node.provider;
        objective.cost += invocation.cost || 0;
        objective.executions.push(this.executionRecord(objective, plan, node, invocation, observation));

        const recovery = recoveryAction(node, observation, {
          catalogue,
          retries: node.retries || 0,
          maxProviderRetries: objective.maxProviderRetries || 2
        });
        node.recovery = recovery;

        if (recovery.action === 'retry' || recovery.action === 'switch-provider' || recovery.action === 'alternate-capability' || recovery.action === 'alternate-provider') {
          objective.replanCount += 1;
          if (objective.replanCount > (objective.maxReplans || 3)) {
            node.status = 'failed';
            node.error = 'max replans exceeded';
            objective.status = OBJECTIVE_STATUS.FAILED;
            objective.error = node.error;
            this.persist(objective);
            return { status: 'failed', objective };
          }
          plan = applyReplan(plan, {
            nodeId: node.id,
            provider: recovery.provider,
            capabilityId: recovery.capabilityId,
            reason: recovery.reason,
            bumpRetry: true
          });
          objective.plan = plan;
          objective.planRevisions = [
            ...(objective.planRevisions || []),
            { version: plan.version, reason: recovery.reason, nodeId: node.id, at: new Date().toISOString() }
          ];
          const retryConstraint = validatePlan(plan, { catalogue, objective, registry: this.registry });
          if (!retryConstraint.ok) {
            node.status = 'blocked';
            node.error = retryConstraint.errors.join('; ');
            objective.status = OBJECTIVE_STATUS.BLOCKED;
            objective.error = node.error;
            this.persist(objective);
            return { status: 'blocked', objective, error: node.error };
          }
          const retryContext = {
            ...context,
            provider: recovery.provider || context.provider,
            enrichPeople: recovery.provider === 'apollo' ? 1 : undefined
          };
          if (recovery.capabilityId) node.capabilityId = recovery.capabilityId;
          if (recovery.provider) retryContext.provider = recovery.provider;
          if (recovery.action === 'alternate-provider' && recovery.provider === 'apollo') {
            resolvedInputs = { ...resolvedInputs, skipApollo: false, enrichPeople: 1 };
          }
          const retryInvocation = await this.invokeNode(node, resolvedInputs, retryContext);
          const retryObs = observeNodeResult(node, retryInvocation);
          node.observation = retryObs;
          node.provider = retryInvocation.provider || node.provider;
          node.reasonSelected = recovery.reason;
          objective.executions.push(this.executionRecord(objective, plan, node, retryInvocation, retryObs));
          if (retryObs.status === OBSERVATION.SUCCESS || retryObs.status === OBSERVATION.PARTIAL) {
            outputs[node.id] = retryInvocation.result;
            completed.add(node.id);
            node.status = retryObs.status === OBSERVATION.PARTIAL ? 'partial' : 'completed';
            node.result = retryInvocation.result;
          } else if (recovery.action === 'accept-partial') {
            outputs[node.id] = retryInvocation.result || invocation.result;
            completed.add(node.id);
            node.status = 'partial';
            node.result = outputs[node.id];
          } else {
            node.status = 'failed';
            node.error = retryObs.reason;
          }
        } else if (recovery.action === 'accept-partial' || observation.status === OBSERVATION.SUCCESS || observation.status === OBSERVATION.PARTIAL) {
          outputs[node.id] = invocation.result;
          completed.add(node.id);
          node.status = observation.status === OBSERVATION.PARTIAL ? 'partial' : 'completed';
          node.result = invocation.result;
        } else if (recovery.action === 'stop') {
          node.status = 'blocked';
          objective.status = OBJECTIVE_STATUS.BLOCKED;
          objective.error = recovery.reason;
          this.persist(objective);
          return { status: 'blocked', objective };
        } else {
          node.status = 'failed';
          node.error = observation.reason;
        }
        this.persist(objective);
      }
    }

    const reportNode = outputs.report || outputs.score || outputs.qualify || outputs.contacts || outputs.research || outputs.discover;
    const prospects = reportNode?.top || reportNode?.prospects || [];
    objective.result = {
      prospects,
      top: (reportNode?.top || prospects).slice(0, objective.context?.topN || 5),
      report: reportNode?.report || this.formatResult(objective, prospects),
      providers: [...new Set(objective.executions.map((e) => e.provider).filter(Boolean))]
    };
    const failed = (plan.nodes || []).filter((n) => n.status === 'failed');
    objective.status = failed.length ? OBJECTIVE_STATUS.FAILED : OBJECTIVE_STATUS.COMPLETED;
    if (failed.length) objective.error = failed.map((n) => `${n.id}: ${n.error}`).join('; ');
    objective.contacted = false;
    this.persist(objective);

    if (this.n8n?.execute && objective.status === OBJECTIVE_STATUS.COMPLETED) {
      const wf = await this.n8n.execute('campaign-prepare', {
        objectiveId: objective.objectiveId,
        planId: plan.planId,
        kind: 'macgyver',
        contacted: false
      }).catch((error) => ({ status: 'failed', error: error.message }));
      objective.workflow = { alias: wf.alias, status: wf.status, executionId: wf.executionId || wf.providerExecutionId || null };
      this.persist(objective);
    }

    return {
      status: objective.status === OBJECTIVE_STATUS.COMPLETED ? 'ok' : 'failed',
      objective,
      plan,
      result: objective.result,
      report: objective.result.report,
      contacted: false
    };
  }

  levels(nodes) {
    const remaining = new Map(nodes.map((n) => [n.id, new Set(n.dependsOn || [])]));
    const byId = new Map(nodes.map((n) => [n.id, n]));
    const levels = [];
    while (remaining.size) {
      const ready = [...remaining.entries()].filter(([, deps]) => deps.size === 0).map(([id]) => id);
      if (!ready.length) break;
      levels.push(ready.map((id) => byId.get(id)));
      for (const id of ready) remaining.delete(id);
      for (const deps of remaining.values()) for (const id of ready) deps.delete(id);
    }
    return levels;
  }

  executionRecord(objective, plan, node, invocation = {}, observation = null) {
    return {
      objectiveId: objective.objectiveId,
      planId: plan.planId,
      planVersion: plan.version,
      nodeId: node.id,
      executionId: `exe_${randomUUID().replace(/-/g, '').slice(0, 10)}`,
      capability: node.capabilityId,
      provider: invocation.provider || node.provider || null,
      reasonSelected: node.reasonSelected,
      status: observation?.status || (invocation.success === false ? 'failed' : 'ok'),
      retryCount: node.retries || 0,
      replanCount: objective.replanCount || 0,
      cost: invocation.cost || 0,
      duration: invocation.latencyMs || 0,
      error: invocation.error || observation?.reason || node.error || null,
      at: new Date().toISOString()
    };
  }

  async invokeNode(node, input, context) {
    try {
      const invocation = await this.registry.invoke(node.capabilityId, {
        ...input,
        approvalId: node.approvalId || input.approvalId,
        authorizedTest: input.authorizedTest === true || node.approvalState === 'required',
        contactDiscoveredProspects: false
      }, {
        ...context,
        provider: context.provider || node.provider
      });
      return invocation;
    } catch (error) {
      return { success: false, error: error.message, result: null, provider: node.provider || null, cost: 0 };
    }
  }

  async requireApproval(objective, plan, node, context) {
    if (!this.approvalGate) {
      return { allowed: false, report: 'ApprovalGate not initialized' };
    }
    const existing = node.approvalId ? await this.approvalGate.get(node.approvalId) : null;
    if (existing?.status === 'approved') return { allowed: true, approvalId: existing.id };
    if (existing?.status === 'pending') {
      return { allowed: false, approvalId: existing.id, report: `Awaiting approval ${existing.id}` };
    }
    const request = await this.approvalGate.request({
      capabilityId: node.capabilityId,
      description: `MacGyver ${objective.objectiveId} node ${node.id}`,
      input: {
        objectiveId: objective.objectiveId,
        planId: plan.planId,
        nodeId: node.id,
        authorizedTest: true,
        contactDiscoveredProspects: false
      },
      reasons: [{ policy: 'external-side-effect', reason: `${node.capabilityId} is an external side effect` }],
      requestedBy: context.actor || 'macgyver'
    });
    if (request.status === 'approved') return { allowed: true, approvalId: request.id };
    return {
      allowed: false,
      approvalId: request.id,
      report: `Approval required for ${node.capabilityId} (${request.id})`
    };
  }

  formatResult(objective, prospects = []) {
    const top = prospects.slice(0, objective.context?.topN || 5);
    const people = prospects.flatMap((p) => p.contacts || []);
    return [
      `Objective ${objective.objectiveId} ${objective.status}.`,
      `Plan ${objective.plan?.planId} v${objective.plan?.version}.`,
      `${prospects.length} companies, ${people.length} named contacts.`,
      ...top.map((p, i) => `#${i + 1} ${p.organizationName || p.name} · ${p.score?.total ?? p.priority?.total ?? 'n/a'} · ${p.contact?.fullName || 'no person'}`),
      'Discovered prospects contacted: 0.'
    ].join('\n');
  }

  explain(objectiveId) {
    const record = this.get(objectiveId || 'latest');
    if (!record) return { status: 'empty', report: 'No objective is loaded.' };
    return {
      status: 'ok',
      objectiveId: record.objectiveId,
      plan: explainPlan(record.plan),
      executions: record.executions || [],
      report: [
        explainPlan(record.plan),
        ...(record.executions || []).map((e) => `${e.nodeId} ${e.capability} via ${e.provider || 'n/a'}: ${e.status}${e.error ? ` (${e.error})` : ''}`)
      ].join('\n')
    };
  }

  async control(input = {}) {
    const matched = typeof input === 'string' ? matchObjectiveControl(input) : input;
    const action = matched?.action || input.action || input.query;
    const record = this.get(input.objectiveId || 'latest');
    if (!record && !/run|start/i.test(String(action))) {
      return { status: 'empty', report: 'No objective is loaded yet.' };
    }
    if (/^stop|cancel/i.test(String(action)) || matched?.action === 'stop') {
      record.status = OBJECTIVE_STATUS.CANCELLED;
      this.persist(record);
      return { status: 'ok', report: `Objective ${record.objectiveId} stopped.` };
    }
    if (matched?.action === 'resume' || /^resume/i.test(String(action))) {
      if (record.status === OBJECTIVE_STATUS.AWAITING_APPROVAL && record.approvalId) {
        return this.resume(record.objectiveId);
      }
      return { status: 'ok', report: `Objective ${record.objectiveId} is ${record.status}.` };
    }
    if (matched?.action === 'skip') {
      const pending = (record.plan?.nodes || []).find((n) => n.status === 'pending' || n.status === 'failed');
      if (pending) {
        pending.status = 'skipped';
        pending.error = 'skipped by operator';
        this.persist(record);
        return { status: 'ok', report: `Skipped ${pending.id} (${pending.capabilityId}).` };
      }
      return { status: 'ok', report: 'No pending step to skip.' };
    }
    if (matched?.action === 'retry') {
      return this.run({ rawRequest: record.rawRequest, actor: 'telegram' });
    }
    if (matched?.action === 'no-contact') {
      record.prohibitedCapabilities = [...new Set([...(record.prohibitedCapabilities || []), ...['voice.call', 'outreach.call', 'outreach.email', 'outreach.execute']])];
      this.persist(record);
      return { status: 'ok', report: 'Outbound capabilities prohibited for this objective.' };
    }
    if (matched?.action === 'why') return this.explain(record.objectiveId);
    if (matched?.action === 'plan') {
      return { status: 'ok', report: explainPlan(record.plan), plan: record.plan };
    }
    if (matched?.action === 'failed') {
      const failed = (record.executions || []).filter((e) => e.status !== 'SUCCESS' && e.status !== 'ok' && e.error);
      return { status: 'ok', report: failed.length ? failed.map((e) => `${e.nodeId}: ${e.error}`).join('\n') : 'No failures recorded.' };
    }
    if (matched?.action === 'cost') {
      return { status: 'ok', report: `Estimated/observed cost ${record.cost || 0}` };
    }
    if (matched?.action === 'blocking') {
      return {
        status: 'ok',
        report: record.status === OBJECTIVE_STATUS.AWAITING_APPROVAL
          ? `Blocked on approval ${record.approvalId}`
          : `Nothing blocking. Status ${record.status}.`
      };
    }
    return { status: 'ok', report: formatObjectiveReply(record), objective: compactObjective(record) };
  }

  async resume(objectiveId, { approvedBy } = {}) {
    const record = this.get(objectiveId);
    if (!record) return { status: 'failed', error: 'unknown objective' };
    if (record.approvalId && this.approvalGate) {
      const decision = await this.approvalGate.get(record.approvalId);
      if (decision?.status !== 'approved') {
        return { status: 'blocked', approvalId: record.approvalId, report: `Approval is ${decision?.status || 'missing'}` };
      }
    }
    const catalogue = this.catalogue({ availableOnly: true });
    record.status = OBJECTIVE_STATUS.RUNNING;
    return this.executePlan(record, record.plan, catalogue, { actor: approvedBy || 'macgyver' });
  }
}
