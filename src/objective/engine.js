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
import { TASK_CLASS } from '../llm/router.js';
import { decideDelegation } from './delegate.js';
import { SwarmOrchestrator } from './swarm.js';
import { SPECIALIST_STATUS } from './specialist.js';

export class MacGyverEngine {
  constructor({
    registry,
    approvalGate,
    n8n,
    memory,
    email,
    router,
    fabric
  } = {}) {
    this.registry = registry;
    this.approvalGate = approvalGate;
    this.n8n = n8n;
    this.email = email || null;
    this.router = router || null;
    this.fabric = fabric || null;
    this.memory = memory || new ObjectiveMemory();
    this.objectives = new Map();
    this.swarm = new SwarmOrchestrator(this);
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

  catalogue(options = {}) {
    const overlay = { ...(this.fabric?.healthOverlay?.() || {}), ...(options.healthOverlay || {}) };
    for (const provider of options.forceUnavailable || []) overlay[provider] = 'UNAVAILABLE';
    return inspectCatalogue(this.registry, { ...options, healthOverlay: overlay });
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
    const catalogue = this.catalogue({
      availableOnly: true,
      forceUnavailable: input.forceUnavailable
    });
    const strategy = suggestStrategy(objective, this.memory.list(20));
    objective.strategy = strategy;
    const decision = decideDelegation(objective, { catalogue });
    objective.delegation = {
      delegate: decision.delegate,
      reason: decision.reason,
      estimatedWorkers: decision.estimatedWorkers,
      estimatedBenefit: decision.estimatedBenefit,
      pattern: decision.pattern,
      slices: decision.slices
    };

    let plan;
    try {
      plan = planObjective(objective, catalogue);
    } catch (error) {
      objective.status = OBJECTIVE_STATUS.FAILED;
      objective.error = error.message;
      this.persist(objective);
      return { status: 'failed', objective, error: error.message };
    }

    if (this.router) {
      try {
        const routing = await this.router.complete({
          taskClass: TASK_CLASS.PLANNING,
          prompt: [
            'Record a PLANNING route for this MacGyver objective.',
            'The DAG is composed deterministically from the live catalogue; do not invent tools.',
            `Objective: ${objective.rawRequest}`,
            `Pattern: ${plan.pattern}`,
            `Nodes: ${plan.nodes.map((n) => n.capabilityId).join(' -> ')}`,
            'Return JSON {"ok":true,"pattern":"...","capabilities":[]}'
          ].join('\n'),
          structuredOutputRequired: true,
          forceUnavailableModels: input.forceUnavailableModels || []
        });
        plan.llm = {
          taskClass: TASK_CLASS.PLANNING,
          model: routing.model || null,
          preferredModel: routing.preferredModel || null,
          fallback: routing.fallback === true,
          fallbackReason: routing.fallbackReason || (routing.status !== 'ok' ? routing.error : null),
          status: routing.status,
          attempts: routing.attempts || []
        };
      } catch (error) {
        plan.llm = {
          taskClass: TASK_CLASS.PLANNING,
          model: null,
          preferredModel: null,
          fallback: false,
          fallbackReason: error.message,
          status: 'failed'
        };
      }
      objective.llm = { planning: plan.llm };
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
      return { status: 'planned', objective, plan, validation, strategy, delegation: objective.delegation };
    }

    if (decision.delegate && input.forceDirect !== true) {
      return this.swarm.execute(objective, decision, catalogue, input);
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
      forceUnavailable: [
        ...(input.forceUnavailable || []),
        ...Object.keys(this.fabric?.healthOverlay?.() || {})
      ],
      healthOverlay: this.fabric?.healthOverlay?.() || {},
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
          const revised = (plan.nodes || []).find((n) => n.id === node.id);
          if (revised) {
            node.provider = revised.provider || node.provider;
            node.capabilityId = revised.capabilityId;
            node.reasonSelected = revised.reasonSelected;
            node.retries = revised.retries;
          }
          const idx = (plan.nodes || []).findIndex((n) => n.id === node.id);
          if (idx >= 0) plan.nodes[idx] = node;
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
          else if (recovery.capabilityId) delete retryContext.provider;
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
          } else if (observation.status === OBSERVATION.PARTIAL) {
            outputs[node.id] = invocation.result;
            completed.add(node.id);
            node.status = 'partial';
            node.result = invocation.result;
            node.error = retryObs.reason;
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

    const reportNode = outputs.compare || outputs.report || outputs.score || outputs.qualify || outputs.contacts || outputs.research || outputs.discover || outputs.lookup;
    if (plan.pattern === 'direct_capability' || outputs.lookup) {
      const packed = outputs.lookup || {};
      const lookup = packed.result && typeof packed.result === 'object' ? packed.result : packed;
      const now = lookup.now || lookup.utc || packed.now || null;
      objective.result = {
        lookup,
        now,
        timezone: lookup.timezone || 'UTC',
        prospects: [],
        top: [],
        report: now
          ? `Current UTC time: ${now}. Timezone UTC. Workers spawned: 0. Direct capability ${plan.nodes?.[0]?.capabilityId}.`
          : (lookup.text || this.formatResult(objective, [])),
        providers: [...new Set(objective.executions.map((e) => e.provider).filter(Boolean))],
        contacted: false
      };
    } else {
      const prospects = reportNode?.top || reportNode?.prospects || [];
      objective.result = {
        prospects,
        top: (reportNode?.top || prospects).slice(0, objective.context?.topN || 5),
        report: reportNode?.report || reportNode?.comparison || this.formatResult(objective, prospects),
        comparison: reportNode?.comparison || null,
        providers: [...new Set(objective.executions.map((e) => e.provider).filter(Boolean))]
      };
    }
    const failed = (plan.nodes || []).filter((n) => n.status === 'failed');
    const discoverDone = completed.has('discover')
      || completed.has('lookup')
      || plan.pattern === 'authorized_test'
      || plan.pattern === 'direct_capability';
    objective.status = (failed.length || !discoverDone) ? OBJECTIVE_STATUS.FAILED : OBJECTIVE_STATUS.COMPLETED;
    if (!discoverDone && !objective.error) objective.error = 'discovery did not complete';
    if (failed.length) objective.error = failed.map((n) => `${n.id}: ${n.error}`).join('; ');
    objective.contacted = false;
    this.persist(objective);

    if (this.router && objective.status === OBJECTIVE_STATUS.COMPLETED && plan.pattern !== 'direct_capability') {
      const wantsCompare = (objective.successCriteria || []).some((s) => s.type === 'comparison')
        || /compar/i.test(objective.rawRequest || '');
      if (wantsCompare) {
        try {
          const top = objective.result.top || [];
          const sum = await this.router.complete({
            taskClass: TASK_CLASS.SUMMARIZATION,
            prompt: `Compare these organizations using only the supplied evidence. Do not invent contacts, emails, or facts.\n${JSON.stringify(top.map((p) => ({
              name: p.organizationName || p.name,
              website: p.website,
              description: p.description || p.intelligence?.description?.value
            })))}\nReturn a short comparison.`
          });
          objective.result.comparison = sum.text || sum.content || objective.result.comparison;
          objective.llm = {
            ...(objective.llm || {}),
            summarization: { model: sum.model, fallback: sum.fallback, status: sum.status }
          };
          if (objective.result.comparison) {
            objective.result.report = `${objective.result.report || ''}\n\nComparison:\n${objective.result.comparison}`;
          }
        } catch (error) {
          logger.warn(`Comparison summarization failed: ${error.message}`);
        }
      }
    }

    if (this.n8n?.execute && objective.status === OBJECTIVE_STATUS.COMPLETED && plan.pattern !== 'direct_capability') {
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

  async inspectTools(matched = {}) {
    const action = matched.action;
    const query = matched.query || '';
    if (action === 'refresh' || /refresh/i.test(query)) {
      if (!this.fabric?.refresh) return { status: 'unavailable', report: 'Tool fabric is not initialized.' };
      const result = await this.fabric.refresh();
      return {
        status: 'ok',
        report: `Tools refreshed. ${result.visible} planner-visible, ${result.quarantined} quarantined of ${result.discovered} discovered.`,
        result
      };
    }
    if (action === 'mcp' || /mcp/i.test(query)) {
      const inspect = this.fabric?.inspect('mcp servers connected') || { report: 'No MCP servers registered.' };
      return { status: 'ok', report: inspect.report, servers: inspect.servers };
    }
    if (action === 'model' || /which model planned/i.test(query)) {
      const record = this.get('latest');
      const planning = record?.llm?.planning;
      if (!planning) return { status: 'ok', report: 'No planning model recorded yet.' };
      const fallback = planning.fallback ? ` (fallback from ${planning.preferredModel}: ${planning.fallbackReason || 'preferred unavailable'})` : '';
      return { status: 'ok', report: `Planning model ${planning.model || 'none'}${fallback}.`, planning };
    }
    if (action === 'health' || /apollo|firecrawl/i.test(query)) {
      const catalogue = this.catalogue({ availableOnly: false });
      const needle = /apollo/i.test(query) ? 'apollo' : /firecrawl/i.test(query) ? 'firecrawl' : null;
      const providers = catalogue.flatMap((c) => (c.providers || []).map((p) => ({ capabilityId: c.capabilityId, ...p })));
      let matches = needle
        ? providers.filter((p) => {
          const blob = `${p.provider} ${p.capabilityId}`.toLowerCase();
          if (blob.includes(needle)) return true;
          if (needle === 'apollo' && /enrich|contact\.discover/.test(blob)) return true;
          return false;
        })
        : providers;
      if (needle === 'apollo' && !matches.length) {
        matches = providers.filter((p) => /enrich|contact/.test(p.capabilityId));
      }
      const lines = matches.slice(0, 20).map((p) => `${p.provider} on ${p.capabilityId}: ${p.health} available=${p.available} cost=${p.expectedCost}`);
      const report = needle === 'apollo'
        ? (lines.join('\n') || 'Apollo is not registered as a standalone provider.') + '\nApollo is used through contact.discover / prospect.enrich, never as a direct outbound tool.'
        : (lines.join('\n') || 'No matching providers.');
      return { status: 'ok', report, providers: matches };
    }
    if (action === 'web-research') {
      const catalogue = this.catalogue({ availableOnly: true });
      const web = catalogue.filter((c) => /web\.|org\.discover|company\.research/.test(c.capabilityId));
      return {
        status: 'ok',
        report: web.map((c) => `${c.capabilityId} via ${c.preferredProvider} (${c.health}, ${c.costClass})`).join('\n') || 'No web research tools.',
        tools: web
      };
    }
    if (this.fabric?.inspect) {
      const inspect = this.fabric.inspect(query || 'tools');
      const native = this.catalogue({ availableOnly: true }).slice(0, 30)
        .map((c) => `${c.capabilityId} · ${c.preferredProvider} · ${c.health} · ${c.costClass}`);
      const report = [
        inspect.report,
        native.length ? `\nNative/provider capabilities:\n${native.join('\n')}` : ''
      ].join('\n').trim();
      return { status: 'ok', report, tools: inspect.tools };
    }
    const catalogue = this.catalogue({ availableOnly: true });
    return {
      status: 'ok',
      report: catalogue.map((c) => `${c.capabilityId} · ${c.preferredProvider} · ${c.health} · ${c.costClass}`).join('\n'),
      tools: catalogue
    };
  }

  inspectSwarm(matched = {}, record) {
    const query = matched.query || '';
    const action = matched.action;
    if (!record) return { status: 'empty', report: 'No objective is loaded yet.' };
    const specialists = record.specialists || [];
    if (action === 'why-delegate') {
      const d = record.delegation;
      return {
        status: 'ok',
        report: d
          ? `Delegate=${d.delegate}. ${d.reason} Estimated workers ${d.estimatedWorkers}. Benefit: ${d.estimatedBenefit}.`
          : 'No delegation decision recorded.'
      };
    }
    if (action === 'pause') {
      record.status = OBJECTIVE_STATUS.PAUSED;
      for (const spec of specialists) {
        if (spec.status === SPECIALIST_STATUS.RUNNING || spec.status === SPECIALIST_STATUS.READY) spec.status = SPECIALIST_STATUS.WAITING;
      }
      this.persist(record);
      return { status: 'ok', report: `Objective ${record.objectiveId} paused. Workers will stop at the next safe boundary.` };
    }
    if (action === 'stop-workers') {
      for (const spec of specialists) {
        if (spec.status !== SPECIALIST_STATUS.COMPLETED && spec.status !== SPECIALIST_STATUS.PARTIAL) {
          spec.status = SPECIALIST_STATUS.CANCELLED;
        }
      }
      record.status = OBJECTIVE_STATUS.CANCELLED;
      this.persist(record);
      return { status: 'ok', report: `Stopped ${specialists.length} workers on ${record.objectiveId}.` };
    }
    if (action === 'worker-models') {
      const lines = specialists.map((s) => `${s.role}${s.slice ? `(${s.slice})` : ''}: ${s.modelSelected || 'n/a'}${s.modelFallback ? ` (fallback from ${s.modelPreferred})` : ''}`);
      return { status: 'ok', report: lines.join('\n') || 'No specialists.' };
    }
    if (action === 'worker-tools') {
      const lines = specialists.map((s) => `${s.role}: ${(s.executions || []).map((e) => `${e.capability}/${e.provider || 'n/a'}`).join(', ') || (s.allowedCapabilities || []).join(', ')}`);
      return { status: 'ok', report: lines.join('\n') || 'No specialists.' };
    }
    if (action === 'worker-findings') {
      const roleMatch = query.match(/the\s+(\w+)\s+(researcher|scout|worker|analyst)/i);
      const needle = (roleMatch?.[1] || '').toLowerCase();
      const spec = specialists.find((s) => (s.slice || s.role || '').toLowerCase().includes(needle))
        || specialists.find((s) => s.role === 'researcher')
        || specialists[0];
      const names = (spec?.result?.findings || []).map((p) => p.organizationName || p.name).filter(Boolean);
      return { status: 'ok', report: spec ? `${spec.role}${spec.slice ? `(${spec.slice})` : ''}: ${names.join(', ') || 'no findings yet'}` : 'No specialists.' };
    }
    const left = specialists.filter((s) => !['COMPLETED', 'PARTIAL', 'FAILED', 'CANCELLED'].includes(s.status)).length;
    const lines = specialists.map((s) => `${s.role}${s.slice ? `(${s.slice})` : ''} · ${s.status} · model=${s.modelSelected || 'n/a'} · tools=${(s.allowedCapabilities || []).join(',')}`);
    return {
      status: 'ok',
      report: [
        `Objective ${record.objectiveId} · ${record.status}`,
        record.delegation ? `Delegation ${record.delegation.delegate ? 'YES' : 'NO'}: ${record.delegation.reason}` : 'No delegation.',
        `${left} workers still active of ${specialists.length}.`,
        ...lines
      ].join('\n')
    };
  }

  async control(input = {}) {
    const matched = typeof input === 'string' ? matchObjectiveControl(input) : input;
    const action = matched?.action || input.action || input.query;
    const inspectActions = new Set(['tools', 'mcp', 'refresh', 'health', 'model', 'web-research']);
    if (inspectActions.has(matched?.action) || inspectActions.has(String(action))) {
      return this.inspectTools(matched || { action, query: input.query || String(action) });
    }
    const swarmActions = new Set(['workers', 'why-delegate', 'worker-models', 'worker-tools', 'worker-findings', 'stop-workers', 'pause']);
    const record = this.get(input.objectiveId || 'latest');
    if (swarmActions.has(matched?.action)) {
      return this.inspectSwarm(matched || { action, query: input.query || String(action) }, record);
    }
    if (!record && !/run|start/i.test(String(action))) {
      return { status: 'empty', report: 'No objective is loaded yet.' };
    }
    if (/^stop|cancel/i.test(String(action)) || matched?.action === 'stop') {
      record.status = OBJECTIVE_STATUS.CANCELLED;
      for (const spec of record.specialists || []) {
        if (spec.status === SPECIALIST_STATUS.RUNNING || spec.status === SPECIALIST_STATUS.CREATED || spec.status === SPECIALIST_STATUS.READY || spec.status === SPECIALIST_STATUS.WAITING) {
          spec.status = SPECIALIST_STATUS.CANCELLED;
        }
      }
      this.persist(record);
      return { status: 'ok', report: `Objective ${record.objectiveId} stopped. Workers cancelled.` };
    }
    if (matched?.action === 'resume' || /^resume/i.test(String(action))) {
      if (record.status === OBJECTIVE_STATUS.AWAITING_APPROVAL && record.approvalId) {
        return this.resume(record.objectiveId);
      }
      if (record.status === OBJECTIVE_STATUS.PAUSED && record.delegation?.delegate) {
        record.status = OBJECTIVE_STATUS.RUNNING;
        const catalogue = this.catalogue({ availableOnly: true });
        return this.swarm.execute(record, record.delegation, catalogue, { actor: 'telegram' });
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
      const planning = record.llm?.planning;
      const modelLine = planning?.model ? ` Planning model ${planning.model}${planning.fallback ? ` (fallback from ${planning.preferredModel})` : ''}.` : '';
      return { status: 'ok', report: `Estimated/observed cost ${record.cost || 0}.${modelLine}` };
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
