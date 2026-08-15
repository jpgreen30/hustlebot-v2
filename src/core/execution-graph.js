/**
 * EXECUTION GRAPH
 *
 * The DAG a complex command is decomposed into. Each node carries what the
 * Master Build Spec requires: owning agent, tools (the capability it calls),
 * inputs, dependencies, acceptance criteria, expected output, estimated
 * cost, and status.
 *
 * Nodes do their work through the capability registry, so a graph never
 * names a vendor - it names a capability, and the registry decides who
 * serves it and what to fall back to.
 *
 *     const graph = new ExecutionGraph({ objective: 'Publish a guide', nodes: [...] });
 *     graph.validate();                       // cycles, missing deps, unknown capabilities
 *     graph.estimateCost(registry);           // before spending anything
 *     await graph.execute({ registry });      // runs ready nodes in parallel
 *
 * Execution stops at a node whose capability requires approval unless that
 * node id was pre-approved, leaving the graph in awaiting_approval so the
 * approval layer can resume it.
 */

import { randomUUID } from 'crypto';
import logger from '../utils/logger.js';

const NODE_STATUS = {
  PENDING: 'pending',
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  SKIPPED: 'skipped',
  AWAITING_APPROVAL: 'awaiting_approval',
  CANCELLED: 'cancelled'
};

const GRAPH_STATUS = {
  DRAFT: 'draft',
  READY: 'ready',
  RUNNING: 'running',
  AWAITING_APPROVAL: 'awaiting_approval',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
};

const TERMINAL_NODE = new Set([
  NODE_STATUS.COMPLETED,
  NODE_STATUS.FAILED,
  NODE_STATUS.SKIPPED,
  NODE_STATUS.CANCELLED
]);

/** Read "result.items.0.url" out of a value. */
function readPath(value, path) {
  if (!path) return value;
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), value);
}

/**
 * Resolve { $ref: 'nodeId.result.url' } references against completed nodes,
 * recursing through objects and arrays. This is how one node's output
 * becomes the next node's input.
 */
function resolveRefs(value, outputs) {
  if (Array.isArray(value)) return value.map((v) => resolveRefs(v, outputs));

  if (value && typeof value === 'object') {
    if (typeof value.$ref === 'string') {
      const [nodeId, ...rest] = value.$ref.split('.');
      if (!(nodeId in outputs)) {
        throw new Error(`Reference "${value.$ref}" points at node "${nodeId}", which has no output`);
      }
      return readPath(outputs[nodeId], rest.join('.'));
    }
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, resolveRefs(v, outputs)])
    );
  }

  return value;
}

/**
 * Acceptance criteria - the spec requires each node to declare what "done"
 * means, so a node that returns junk fails rather than passing it downstream.
 */
function checkAcceptance(criteria = [], output) {
  const failures = [];

  for (const c of criteria) {
    const actual = readPath(output, c.path);
    switch (c.type) {
      case 'exists':
        if (actual === undefined || actual === null || actual === '') {
          failures.push(`expected "${c.path || 'output'}" to exist`);
        }
        break;
      case 'equals':
        if (actual !== c.value) {
          failures.push(`expected "${c.path}" to equal ${JSON.stringify(c.value)}, got ${JSON.stringify(actual)}`);
        }
        break;
      case 'minLength':
        if (!actual || actual.length < c.value) {
          failures.push(`expected "${c.path}" to have length >= ${c.value}, got ${actual?.length ?? 0}`);
        }
        break;
      case 'nonEmptyArray':
        if (!Array.isArray(actual) || actual.length === 0) {
          failures.push(`expected "${c.path}" to be a non-empty array`);
        }
        break;
      case 'matches':
        if (typeof actual !== 'string' || !new RegExp(c.value).test(actual)) {
          failures.push(`expected "${c.path}" to match /${c.value}/`);
        }
        break;
      default:
        failures.push(`unknown acceptance criterion type "${c.type}"`);
    }
  }

  return failures;
}

class ExecutionGraph {
  constructor({ id, objective, nodes = [], vertical = null, projectId = null, metadata = {} } = {}) {
    this.id = id || `graph-${Date.now()}-${randomUUID().slice(0, 8)}`;
    this.objective = objective || '';
    this.vertical = vertical;
    this.projectId = projectId;
    this.metadata = metadata;
    this.status = GRAPH_STATUS.DRAFT;
    this.createdAt = Date.now();
    this.startedAt = null;
    this.completedAt = null;
    this.error = null;
    this.actualCost = 0;

    this.nodes = nodes.map((n) => this.normalizeNode(n));
  }

  normalizeNode(node) {
    if (!node.id) throw new Error('Every graph node needs an id');
    if (!node.capabilityId) throw new Error(`Node "${node.id}" needs a capabilityId`);

    return {
      id: node.id,
      description: node.description || node.capabilityId,
      // "owning agent" and "tools" from the spec
      agent: node.agent || 'system',
      capabilityId: node.capabilityId,
      inputs: node.inputs || {},
      dependsOn: node.dependsOn || [],
      acceptanceCriteria: node.acceptanceCriteria || [],
      expectedOutput: node.expectedOutput || null,
      estimatedCost: node.estimatedCost ?? null,
      status: node.status || NODE_STATUS.PENDING,
      result: node.result ?? null,
      error: node.error ?? null,
      provider: node.provider ?? null,
      startedAt: node.startedAt ?? null,
      completedAt: node.completedAt ?? null,
      attempts: node.attempts ?? 0,
      approvalId: node.approvalId ?? null
    };
  }

  getNode(id) {
    return this.nodes.find((n) => n.id === id) || null;
  }

  /**
   * Structural validation: unique ids, dependencies that exist, no cycles,
   * and (when a registry is supplied) capabilities that are actually known.
   * Returns the list of problems rather than throwing on the first one.
   */
  validate(registry = null) {
    const errors = [];
    const ids = new Set();

    for (const node of this.nodes) {
      if (ids.has(node.id)) errors.push(`Duplicate node id: "${node.id}"`);
      ids.add(node.id);
    }

    for (const node of this.nodes) {
      for (const dep of node.dependsOn) {
        if (!ids.has(dep)) {
          errors.push(`Node "${node.id}" depends on "${dep}", which does not exist`);
        }
        if (dep === node.id) errors.push(`Node "${node.id}" depends on itself`);
      }

      if (registry && !registry.has(node.capabilityId)) {
        errors.push(`Node "${node.id}" uses unknown capability "${node.capabilityId}"`);
      }
    }

    const cycle = this.findCycle();
    if (cycle) errors.push(`Cycle detected: ${cycle.join(' -> ')}`);

    return errors;
  }

  /** Depth-first search for a back edge, returning the offending path. */
  findCycle() {
    const state = new Map(); // 0 unvisited, 1 in progress, 2 done
    const stack = [];
    let found = null;

    const visit = (id) => {
      if (found) return;
      const node = this.getNode(id);
      if (!node) return;

      if (state.get(id) === 1) {
        found = [...stack.slice(stack.indexOf(id)), id];
        return;
      }
      if (state.get(id) === 2) return;

      state.set(id, 1);
      stack.push(id);
      for (const dep of node.dependsOn) visit(dep);
      stack.pop();
      state.set(id, 2);
    };

    for (const node of this.nodes) visit(node.id);
    return found;
  }

  /**
   * Nodes grouped into dependency levels. Everything inside a level can run
   * in parallel; levels run in order.
   */
  topologicalLevels() {
    const errors = this.validate();
    if (errors.length) throw new Error(`Cannot order an invalid graph: ${errors[0]}`);

    const remaining = new Map(this.nodes.map((n) => [n.id, new Set(n.dependsOn)]));
    const levels = [];

    while (remaining.size > 0) {
      const ready = [...remaining.entries()]
        .filter(([, deps]) => deps.size === 0)
        .map(([id]) => id);

      if (ready.length === 0) throw new Error('Cycle detected while ordering graph');

      levels.push(ready);
      for (const id of ready) remaining.delete(id);
      for (const deps of remaining.values()) {
        for (const id of ready) deps.delete(id);
      }
    }

    return levels;
  }

  /**
   * What the graph is expected to cost, from the registry's per-capability
   * estimates. Callers can refuse to run before spending anything.
   */
  estimateCost(registry) {
    let total = 0;
    const breakdown = [];

    for (const node of this.nodes) {
      let cost = node.estimatedCost;

      if (cost == null && registry) {
        const described = registry.describe(node.capabilityId);
        const preferred = registry.resolve(node.capabilityId, { vertical: this.vertical })[0];
        cost =
          preferred?.expectedCost ??
          described?.providers?.[0]?.expectedCost ??
          0;
      }

      cost = cost ?? 0;
      total += cost;
      breakdown.push({ nodeId: node.id, capabilityId: node.capabilityId, estimatedCost: cost });
    }

    return { total: Number(total.toFixed(4)), breakdown };
  }

  /** Capabilities in this graph that the approval layer must gate. */
  approvalRequirements(registry) {
    if (!registry) return [];

    return this.nodes
      .filter((node) => {
        const described = registry.describe(node.capabilityId);
        return described?.providers?.some((p) => p.requiresApproval);
      })
      .map((node) => ({
        nodeId: node.id,
        capabilityId: node.capabilityId,
        description: node.description
      }));
  }

  /**
   * Run the graph. Ready nodes execute in parallel, level by level.
   *
   * options:
   *   registry           capability registry (required)
   *   context            passed through to registry.invoke (permissions etc.)
   *   approvedNodes      node ids cleared to run despite requiring approval
   *   maxCost            refuse to start if the estimate exceeds this
   *   onNodeChange       callback for progress reporting
   */
  /**
   * Decide whether a node may run.
   *
   * Without an approval gate this falls back to the capability's
   * requiresApproval flag, which only ever pauses. With a gate it consults
   * the policies, raises a request, and honours an existing decision -
   * including running with the inputs a human modified.
   */
  async checkApproval(node, resolvedInputs, { registry, approvalGate, context }) {
    if (!approvalGate) {
      const described = registry.describe(node.capabilityId);
      const needsApproval = described?.providers?.some((p) => p.requiresApproval);
      return needsApproval
        ? { status: 'pending', message: `Requires approval: ${node.capabilityId}` }
        : { status: 'allowed' };
    }

    // An earlier run may already have a decision for this node.
    const existing = await approvalGate.findForNode(this.id, node.id);
    if (existing) {
      if (existing.status === 'approved') {
        return {
          status: 'allowed',
          inputs: existing.modifiedInputs || null,
          approvalId: existing.id
        };
      }
      if (existing.status === 'rejected') {
        return {
          status: 'rejected',
          message: `Rejected by ${existing.decidedBy}${existing.notes ? `: ${existing.notes}` : ''}`,
          approvalId: existing.id
        };
      }
      if (existing.status === 'expired') {
        return {
          status: 'rejected',
          message: 'Approval request expired before anyone decided',
          approvalId: existing.id
        };
      }
      // Still pending - keep waiting rather than raising a duplicate.
      return {
        status: 'pending',
        message: `Awaiting approval (${existing.id})`,
        approvalId: existing.id
      };
    }

    const verdict = approvalGate.evaluate({
      capabilityId: node.capabilityId,
      input: resolvedInputs,
      context,
      estimatedCost: node.estimatedCost ?? undefined
    });
    if (!verdict.required) return { status: 'allowed' };

    const request = await approvalGate.request({
      capabilityId: node.capabilityId,
      description: node.description,
      input: resolvedInputs,
      reasons: verdict.reasons,
      estimatedCost: verdict.estimatedCost,
      graphId: this.id,
      nodeId: node.id,
      projectId: this.projectId,
      requestedBy: context.actor || node.agent || 'planner'
    });

    // autoApprove short-circuits to an approved record.
    if (request.status === 'approved') {
      return { status: 'allowed', inputs: request.modifiedInputs || null, approvalId: request.id };
    }

    return {
      status: 'pending',
      message: `Awaiting approval (${request.id}): ${verdict.reasons.map((r) => r.reason).join('; ')}`,
      approvalId: request.id
    };
  }

  async execute(options = {}) {
    const { registry, context = {}, approvedNodes = [], maxCost, onNodeChange, approvalGate = null } = options;
    if (!registry) throw new Error('execute() requires a capability registry');

    const errors = this.validate(registry);
    if (errors.length > 0) {
      this.status = GRAPH_STATUS.FAILED;
      this.error = errors[0];
      throw new Error(`Invalid execution graph: ${errors.join('; ')}`);
    }

    if (maxCost != null) {
      const { total } = this.estimateCost(registry);
      if (total > maxCost) {
        this.status = GRAPH_STATUS.FAILED;
        this.error = `Estimated cost $${total} exceeds budget $${maxCost}`;
        throw new Error(this.error);
      }
    }

    this.status = GRAPH_STATUS.RUNNING;
    this.startedAt = this.startedAt || Date.now();

    const approved = new Set(approvedNodes);
    const outputs = {};
    for (const node of this.nodes) {
      if (node.status === NODE_STATUS.COMPLETED) outputs[node.id] = node.result;
    }

    const setStatus = (node, status, patch = {}) => {
      Object.assign(node, patch, { status });
      if (onNodeChange) {
        try {
          onNodeChange({ graphId: this.id, nodeId: node.id, status, ...patch });
        } catch (error) {
          logger.error(`Graph progress callback failed: ${error.message}`);
        }
      }
    };

    let pausedForApproval = false;

    for (const level of this.topologicalLevels()) {
      const runnable = level.filter((id) => {
        const node = this.getNode(id);
        return node.status === NODE_STATUS.PENDING;
      });

      // A node whose dependency did not complete cannot run.
      for (const id of level) {
        const node = this.getNode(id);
        if (node.status !== NODE_STATUS.PENDING) continue;

        const blocked = node.dependsOn.filter((dep) => {
          const d = this.getNode(dep);
          return d.status !== NODE_STATUS.COMPLETED;
        });
        if (blocked.length > 0) {
          setStatus(node, NODE_STATUS.SKIPPED, {
            error: `Skipped: dependencies did not complete (${blocked.join(', ')})`,
            completedAt: Date.now()
          });
        }
      }

      const stillRunnable = runnable.filter(
        (id) => this.getNode(id).status === NODE_STATUS.PENDING
      );

      await Promise.all(
        stillRunnable.map(async (id) => {
          const node = this.getNode(id);

          let resolvedInputs;
          try {
            resolvedInputs = resolveRefs(node.inputs, outputs);
          } catch (error) {
            setStatus(node, NODE_STATUS.FAILED, {
              error: error.message,
              completedAt: Date.now()
            });
            return;
          }

          // ---- Approval gate --------------------------------------------
          // Inputs are resolved first so the request shows a human the real
          // values, not unresolved $ref placeholders.
          if (!approved.has(node.id) && !context.bypassApproval) {
            const gateOutcome = await this.checkApproval(node, resolvedInputs, {
              registry,
              approvalGate,
              context
            });

            if (gateOutcome.status === 'rejected') {
              setStatus(node, NODE_STATUS.FAILED, {
                error: gateOutcome.message,
                completedAt: Date.now()
              });
              return;
            }
            if (gateOutcome.status === 'pending') {
              setStatus(node, NODE_STATUS.AWAITING_APPROVAL, {
                error: gateOutcome.message,
                approvalId: gateOutcome.approvalId || null
              });
              pausedForApproval = true;
              return;
            }
            if (gateOutcome.inputs) resolvedInputs = gateOutcome.inputs;
          }

          setStatus(node, NODE_STATUS.RUNNING, { startedAt: Date.now() });
          node.attempts++;

          try {
            const invocation = await registry.invoke(node.capabilityId, resolvedInputs, {
              ...context,
              vertical: context.vertical || this.vertical,
              projectId: context.projectId || this.projectId,
              actor: node.agent
            });

            const failures = checkAcceptance(node.acceptanceCriteria, invocation.result);
            if (failures.length > 0) {
              setStatus(node, NODE_STATUS.FAILED, {
                error: `Acceptance criteria not met: ${failures.join('; ')}`,
                result: invocation.result,
                provider: invocation.provider,
                completedAt: Date.now()
              });
              return;
            }

            outputs[node.id] = invocation.result;
            this.actualCost += invocation.cost || 0;
            setStatus(node, NODE_STATUS.COMPLETED, {
              result: invocation.result,
              provider: invocation.provider,
              error: null,
              completedAt: Date.now()
            });
          } catch (error) {
            setStatus(node, NODE_STATUS.FAILED, {
              error: error.message,
              completedAt: Date.now()
            });
          }
        })
      );
    }

    // Anything still pending was blocked behind a paused or failed node.
    for (const node of this.nodes) {
      if (node.status === NODE_STATUS.PENDING && pausedForApproval) continue;
      if (node.status === NODE_STATUS.PENDING) {
        setStatus(node, NODE_STATUS.SKIPPED, {
          error: 'Skipped: never became runnable',
          completedAt: Date.now()
        });
      }
    }

    const failed = this.nodes.filter((n) => n.status === NODE_STATUS.FAILED);
    if (pausedForApproval) {
      this.status = GRAPH_STATUS.AWAITING_APPROVAL;
    } else if (failed.length > 0) {
      this.status = GRAPH_STATUS.FAILED;
      this.error = `${failed.length} node(s) failed: ${failed.map((n) => n.id).join(', ')}`;
      this.completedAt = Date.now();
    } else {
      this.status = GRAPH_STATUS.COMPLETED;
      this.completedAt = Date.now();
    }

    this.actualCost = Number(this.actualCost.toFixed(4));
    return this.summary();
  }

  summary() {
    const byStatus = {};
    for (const node of this.nodes) {
      byStatus[node.status] = (byStatus[node.status] || 0) + 1;
    }

    return {
      graphId: this.id,
      objective: this.objective,
      status: this.status,
      nodes: this.nodes.length,
      byStatus,
      actualCost: this.actualCost,
      error: this.error,
      awaitingApproval: this.nodes
        .filter((n) => n.status === NODE_STATUS.AWAITING_APPROVAL)
        .map((n) => ({ nodeId: n.id, capabilityId: n.capabilityId, approvalId: n.approvalId })),
      outputs: Object.fromEntries(
        this.nodes
          .filter((n) => n.status === NODE_STATUS.COMPLETED)
          .map((n) => [n.id, n.result])
      )
    };
  }

  /** JSON-serializable, so a graph can live in the job queue or Redis. */
  toJSON() {
    return {
      id: this.id,
      objective: this.objective,
      vertical: this.vertical,
      projectId: this.projectId,
      metadata: this.metadata,
      status: this.status,
      createdAt: this.createdAt,
      startedAt: this.startedAt,
      completedAt: this.completedAt,
      error: this.error,
      actualCost: this.actualCost,
      nodes: this.nodes
    };
  }

  static fromJSON(json) {
    const graph = new ExecutionGraph({
      id: json.id,
      objective: json.objective,
      vertical: json.vertical,
      projectId: json.projectId,
      metadata: json.metadata,
      nodes: json.nodes || []
    });
    graph.status = json.status || GRAPH_STATUS.DRAFT;
    graph.createdAt = json.createdAt || Date.now();
    graph.startedAt = json.startedAt || null;
    graph.completedAt = json.completedAt || null;
    graph.error = json.error || null;
    graph.actualCost = json.actualCost || 0;
    return graph;
  }

  /** Text rendering for Telegram and logs. */
  toText() {
    const icon = {
      [NODE_STATUS.PENDING]: '·',
      [NODE_STATUS.RUNNING]: '▶',
      [NODE_STATUS.COMPLETED]: '✅',
      [NODE_STATUS.FAILED]: '❌',
      [NODE_STATUS.SKIPPED]: '⏭',
      [NODE_STATUS.AWAITING_APPROVAL]: '🔒',
      [NODE_STATUS.CANCELLED]: '🚫'
    };

    const lines = this.topologicalLevels().map((level, i) => {
      const rows = level.map((id) => {
        const n = this.getNode(id);
        const deps = n.dependsOn.length ? ` ← ${n.dependsOn.join(', ')}` : '';
        return `    ${icon[n.status] || '·'} ${n.id}: ${n.description} [${n.capabilityId}]${deps}`;
      });
      return `  Step ${i + 1}:\n${rows.join('\n')}`;
    });

    return `${this.objective} (${this.status})\n${lines.join('\n')}`;
  }
}

export { ExecutionGraph, NODE_STATUS, GRAPH_STATUS, resolveRefs, checkAcceptance };
