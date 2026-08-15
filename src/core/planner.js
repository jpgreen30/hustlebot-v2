/**
 * PLANNING SWARM
 *
 * Turns a natural-language objective into an execution graph, using the
 * capability registry as the menu of what the platform can actually do.
 *
 *     const plan = await planner.plan('Write and publish a guide on sleep training');
 *     plan.graph.toText();
 *     await planner.execute(plan.graph, { permissions: [...] });
 *
 * The LLM only ever chooses among registered capabilities, and its output is
 * validated against the registry before anything runs - an unknown
 * capability, a bad dependency, or a cycle is rejected as a planning
 * failure rather than discovered halfway through execution.
 *
 * With no LLM available the planner still produces a usable single-step
 * graph when the objective clearly maps to one capability, so the system
 * degrades instead of stopping.
 */

import logger from '../utils/logger.js';
import { ExecutionGraph, GRAPH_STATUS } from './execution-graph.js';

const PLAN_INSTRUCTIONS = `You are the planning swarm for an autonomous business operating system.

Decompose the OBJECTIVE into a directed acyclic graph of steps. Each step calls
exactly one capability from the CAPABILITIES list. You may only use capability
ids from that list.

Return ONLY a JSON object, no prose, no markdown fence:

{
  "objective": "restated objective",
  "nodes": [
    {
      "id": "short_snake_case_id",
      "description": "what this step accomplishes",
      "agent": "which agent owns it, e.g. research, content, publishing",
      "capabilityId": "one id from CAPABILITIES",
      "inputs": { "key": "value, or {\\"$ref\\": \\"other_node_id.field\\"} to use a previous step's output" },
      "dependsOn": ["ids of steps that must finish first"],
      "acceptanceCriteria": [{ "type": "exists", "path": "content" }],
      "expectedOutput": "what this step produces"
    }
  ]
}

Rules:
- Use the fewest steps that genuinely accomplish the objective.
- dependsOn must reference ids defined in this same plan. No cycles.
- Steps with no dependency on each other should have disjoint dependsOn so they run in parallel.
- acceptanceCriteria types: exists, equals, minLength, nonEmptyArray, matches.
- If the objective cannot be accomplished with the available capabilities,
  return {"error": "explain what capability is missing"}.`;

class Planner {
  constructor({ registry, llm, jobQueue = null, approvalGate = null, maxNodes = 12 } = {}) {
    this.registry = registry;
    this.llm = llm;
    this.jobQueue = jobQueue;
    this.approvalGate = approvalGate;
    this.maxNodes = maxNodes;
    this.graphs = new Map(); // graphId -> ExecutionGraph
  }

  /**
   * The menu handed to the planner. Only capabilities with a usable provider
   * are offered, so it cannot plan around something that is switched off.
   */
  capabilityCatalogue(vertical) {
    return this.registry
      .list({ vertical, availableOnly: true })
      .map((cap) => {
        const described = this.registry.describe(cap.capabilityId);
        const preferred = described.providers[0];
        return {
          capabilityId: cap.capabilityId,
          description: preferred?.description || preferred?.name || '',
          inputs: preferred?.inputs?.properties
            ? Object.keys(preferred.inputs.properties)
            : [],
          required: preferred?.inputs?.required || [],
          estimatedCost: preferred?.expectedCost ?? 0,
          requiresApproval: cap.requiresApproval
        };
      });
  }

  /**
   * Plan an objective. Returns { graph, estimate, approvals, source }.
   */
  async plan(objective, options = {}) {
    if (!objective || !objective.trim()) throw new Error('An objective is required');
    if (!this.registry) throw new Error('Planner requires a capability registry');

    const vertical = options.vertical || null;
    const catalogue = this.capabilityCatalogue(vertical);

    if (catalogue.length === 0) {
      throw new Error('No capabilities are currently available to plan with');
    }

    let spec;
    let source = 'llm';

    if (this.llm) {
      try {
        spec = await this.planWithLLM(objective, catalogue, options);
      } catch (error) {
        logger.warn(`LLM planning failed (${error.message}), falling back to direct match`);
        spec = null;
      }
    }

    if (!spec) {
      spec = this.planDirect(objective, catalogue);
      source = 'fallback';
    }

    const graph = new ExecutionGraph({
      objective: spec.objective || objective,
      nodes: spec.nodes,
      vertical,
      projectId: options.projectId || null,
      metadata: { source, plannedAt: Date.now() }
    });

    const errors = graph.validate(this.registry);
    if (errors.length > 0) {
      throw new Error(`Planner produced an invalid graph: ${errors.join('; ')}`);
    }

    graph.status = GRAPH_STATUS.READY;
    this.graphs.set(graph.id, graph);

    const estimate = graph.estimateCost(this.registry);
    const approvals = graph.approvalRequirements(this.registry);

    logger.info(
      `🧠 Planned "${objective}" into ${graph.nodes.length} step(s), ` +
      `est $${estimate.total}${approvals.length ? `, ${approvals.length} needing approval` : ''}`
    );

    return { graph, estimate, approvals, source };
  }

  async planWithLLM(objective, catalogue, options = {}) {
    const prompt =
      `${PLAN_INSTRUCTIONS}\n\n` +
      `CAPABILITIES:\n${JSON.stringify(catalogue, null, 2)}\n\n` +
      `OBJECTIVE:\n${objective}\n\n` +
      (options.context ? `CONTEXT:\n${JSON.stringify(options.context)}\n\n` : '') +
      `JSON:`;

    const response = await this.llm.complete(prompt, {
      taskType: 'reason',
      maxTokens: options.maxTokens || 2000,
      temperature: 0.2
    });

    const spec = this.parsePlan(response.content);

    if (spec.error) throw new Error(`Planner declined: ${spec.error}`);
    if (!Array.isArray(spec.nodes) || spec.nodes.length === 0) {
      throw new Error('Planner returned no steps');
    }
    if (spec.nodes.length > this.maxNodes) {
      throw new Error(`Planner returned ${spec.nodes.length} steps, over the ${this.maxNodes} limit`);
    }

    const known = new Set(catalogue.map((c) => c.capabilityId));
    for (const node of spec.nodes) {
      if (!known.has(node.capabilityId)) {
        throw new Error(`Planner chose unavailable capability "${node.capabilityId}"`);
      }
    }

    return spec;
  }

  /**
   * LLMs wrap JSON in prose or fences often enough that this is worth doing
   * properly rather than trusting a bare JSON.parse.
   */
  parsePlan(text) {
    if (!text || typeof text !== 'string') throw new Error('Planner returned nothing');

    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    const candidate = fenced ? fenced[1] : text;

    const start = candidate.indexOf('{');
    const end = candidate.lastIndexOf('}');
    if (start === -1 || end === -1) throw new Error('Planner output contained no JSON object');

    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch (error) {
      throw new Error(`Planner output was not valid JSON: ${error.message}`);
    }
  }

  /**
   * No-LLM fallback: if the objective names a capability we have, run just
   * that. Better a correct one-step plan than nothing.
   */
  planDirect(objective, catalogue) {
    const lower = objective.toLowerCase();

    const scored = catalogue
      .map((cap) => {
        const words = cap.capabilityId.split(/[.\-_]/);
        const hits = words.filter((w) => w.length > 3 && lower.includes(w)).length;
        return { cap, hits };
      })
      .filter((s) => s.hits > 0)
      .sort((a, b) => b.hits - a.hits);

    const chosen = scored[0]?.cap;
    if (!chosen) {
      throw new Error(
        'Could not map the objective to an available capability without an LLM. ' +
        `Available: ${catalogue.map((c) => c.capabilityId).join(', ')}`
      );
    }

    return {
      objective,
      nodes: [
        {
          id: 'step_1',
          description: objective,
          agent: 'system',
          capabilityId: chosen.capabilityId,
          inputs: { topic: objective, query: objective, prompt: objective },
          dependsOn: [],
          acceptanceCriteria: [],
          expectedOutput: chosen.description
        }
      ]
    };
  }

  /**
   * Run a graph now. Prefer runAsJob() for anything long - it survives a
   * restart, this does not.
   */
  async execute(graph, context = {}, options = {}) {
    return graph.execute({
      registry: this.registry,
      approvalGate: options.approvalGate ?? this.approvalGate,
      context,
      approvedNodes: options.approvedNodes || [],
      maxCost: options.maxCost,
      onNodeChange: options.onNodeChange
    });
  }

  /**
   * Re-run a graph that stopped for approval. Nodes whose approval has since
   * been decided are reset to pending so execute() re-evaluates them; a
   * rejection surfaces there as a failed node.
   */
  async resume(graphId, context = {}, options = {}) {
    const graph = this.getGraph(graphId);
    if (!graph) throw new Error(`Unknown graph: ${graphId}`);

    let resumable = 0;
    for (const node of graph.nodes) {
      if (node.status !== 'awaiting_approval') continue;

      if (this.approvalGate) {
        const decision = await this.approvalGate.findForNode(graph.id, node.id);
        // Still undecided - leave it parked.
        if (!decision || decision.status === 'pending') continue;
      }
      node.status = 'pending';
      node.error = null;
      resumable++;
    }

    if (resumable === 0) {
      return { ...graph.summary(), resumed: 0, message: 'No decided approvals to resume' };
    }

    const summary = await this.execute(graph, context, options);
    return { ...summary, resumed: resumable };
  }

  /**
   * Queue a graph for durable execution. The graph travels as JSON in the
   * job payload, so it survives the restart that would otherwise lose it.
   */
  async runAsJob(graph, context = {}, options = {}) {
    if (!this.jobQueue) throw new Error('Planner has no job queue configured');

    return this.jobQueue.createJob(
      'plan.execute',
      {
        graph: graph.toJSON(),
        context,
        approvedNodes: options.approvedNodes || [],
        maxCost: options.maxCost
      },
      { projectId: graph.projectId, createdBy: context.actor || 'planner' }
    );
  }

  /**
   * Handler the job queue calls. Registered by the server at startup.
   */
  planExecutionHandler() {
    return async (payload) => {
      const graph = ExecutionGraph.fromJSON(payload.graph);
      this.graphs.set(graph.id, graph);

      const summary = await graph.execute({
        registry: this.registry,
        approvalGate: this.approvalGate,
        context: payload.context || {},
        approvedNodes: payload.approvedNodes || [],
        maxCost: payload.maxCost
      });

      // Returning the whole graph keeps the job result self-describing.
      return { summary, graph: graph.toJSON() };
    };
  }

  getGraph(graphId) {
    return this.graphs.get(graphId) || null;
  }

  listGraphs() {
    return [...this.graphs.values()].map((g) => g.summary());
  }
}

export { Planner, PLAN_INSTRUCTIONS };
