/**
 * Bounded specialist orchestrator. MacGyver remains the supervisor.
 * CrewAI/Swarms/LangGraph were rejected — see framework-eval.js.
 */

import logger from '../utils/logger.js';
import { TASK_CLASS } from '../llm/router.js';
import { isOutboundCapability, pickCapability } from './catalogue.js';
import { OBJECTIVE_STATUS } from './schema.js';
import { mapLimit } from './util.js';
import { DELEGATION_DEFAULTS } from './delegate.js';
import {
  SPECIALIST_STATUS,
  createSpecialist,
  isGranted,
  validateSpecialistResult,
  emptyResult
} from './specialist.js';
import { packContext, wrapUntrusted } from './context-pack.js';
import { arbitrate } from './arbitrate.js';
import { shouldRunCritic, critique } from './critic.js';
import { looksLikeCompany, isJunkResult, discoveryIntent, onTopic } from './discover.js';
import { classifySearchResult, RESULT_ROLE, inferPlaybookClass } from '../intel/classify.js';
import { proposeAdaptations } from '../intel/adapt.js';

export class SwarmOrchestrator {
  constructor(engine, config = {}) {
    this.engine = engine;
    this.maxConcurrentWorkers = Number(config.maxConcurrentWorkers || process.env.HUSTLEBOT_MAX_CONCURRENT_WORKERS || DELEGATION_DEFAULTS.maxConcurrentWorkers);
    this.maxWorkersPerObjective = Number(config.maxWorkersPerObjective || process.env.HUSTLEBOT_MAX_WORKERS || DELEGATION_DEFAULTS.maxWorkersPerObjective);
    this.maxTotalActions = Number(config.maxTotalActions || DELEGATION_DEFAULTS.maxTotalActions);
    this.maxRepairCycles = Number(config.maxRepairCycles || DELEGATION_DEFAULTS.maxRepairCycles);
  }

  compose(objective, decision, catalogue) {
    const slices = (decision.slices || []).filter((s) => s && !/^(general|landscape)$/i.test(s)).slice(0, 3);
    const usable = slices.length ? slices : [];
    const perSlice = Math.max(3, Math.ceil(Number(objective.context?.findN || 10) / Math.max(usable.length, 1)));
    const specialists = [];
    const scoutCap = Math.max(1, this.maxWorkersPerObjective - 2);

    if (!usable.length) {
      specialists.push(createSpecialist({
        objective,
        catalogue,
        role: 'scout',
        slice: null,
        mission: 'Discover public organizations matching the objective. Do not contact anyone.',
        scope: {
          findN: Number(objective.context?.findN || 10),
          query: objective.context?.query || objective.rawRequest,
          location: objective.context?.location,
          industry: objective.context?.industry
        }
      }));
    } else {
      for (const slice of usable) {
        if (specialists.length >= scoutCap) break;
        specialists.push(createSpecialist({
          objective,
          catalogue,
          role: 'scout',
          slice,
          mission: `Discover public ${slice} organizations${objective.context?.location ? ` in ${objective.context.location}` : ''} matching the objective. Do not contact anyone.`,
          scope: {
            findN: perSlice,
            industry: slice,
            location: objective.context?.location,
            query: `${slice} ${objective.context?.location || ''}`.trim()
          }
        }));
      }
    }

    const scoutIds = specialists.map((s) => s.specialistId);
    if (specialists.length < this.maxWorkersPerObjective - 1) {
      specialists.push(createSpecialist({
        objective,
        catalogue,
        role: 'researcher',
        mission: 'Research discovered organizations from public sources only.',
        dependsOn: scoutIds,
        scope: { findN: objective.context?.findN }
      }));
    }
    const landscape = /competitive landscape|apps?\b|platforms?\b|parenting|market map/i.test(objective.rawRequest || '')
      || decision.pattern === 'competitive-landscape';
    const researcher = specialists.find((s) => s.role === 'researcher');
    if (!landscape && specialists.length < this.maxWorkersPerObjective - 1 && pickCapability(catalogue, ['contact.discover.batch', 'contact.discover'])) {
      specialists.push(createSpecialist({
        objective,
        catalogue,
        role: 'contact-researcher',
        mission: 'Find publicly listed decision makers. Do not contact them.',
        dependsOn: researcher ? [researcher.specialistId] : scoutIds
      }));
    }
    if (landscape && specialists.length < this.maxWorkersPerObjective - 1 && pickCapability(catalogue, ['intelligence.research'])) {
      specialists.push(createSpecialist({
        objective,
        catalogue,
        role: 'source-scout',
        mission: 'Select and query public sources. Newly discovered sites stay DISCOVERED, not trusted.',
        dependsOn: scoutIds,
        scope: {
          findN: objective.context?.findN,
          query: usable[0] || objective.context?.query || objective.rawRequest,
          slices: usable
        }
      }));
    }
    if (landscape && specialists.length < this.maxWorkersPerObjective && pickCapability(catalogue, ['intelligence.market-map', 'intelligence.verify'])) {
      specialists.push(createSpecialist({
        objective,
        catalogue,
        role: pickCapability(catalogue, ['intelligence.market-map']) ? 'market-mapper' : 'verifier',
        mission: 'Map the market from evidence. Gaps are OBSERVED, not a census.',
        dependsOn: specialists.map((s) => s.specialistId)
      }));
    }
    specialists.push(createSpecialist({
      objective,
      catalogue,
      role: 'synthesizer',
      mission: 'Synthesize ranked recommendations from specialist evidence. Do not invent facts.',
      dependsOn: specialists.map((s) => s.specialistId)
    }));
    return specialists;
  }

  keepOnTopic(findings, objective) {
    const intent = discoveryIntent(objective.rawRequest || '', objective.rawRequest || '');
    const question = objective.rawRequest || '';
    const playbook = inferPlaybookClass(question);
    const strict = playbook !== 'general-research';
    const productQuery = (objective.context?.slices || [])
      .filter((s) => s && !/^(general|landscape|solutions serving)/i.test(s))
      .join(' ') || null;
    return (findings || []).filter((p) => {
      const item = { title: p.organizationName || p.name, url: p.website || p.sourceUrl, snippet: p.description };
      if (!item.title) return false;
      if (/^use my location$/i.test(item.title)) return false;
      if (/yellowpages\.com\/search/i.test(String(item.url || ''))) return false;
      if (isJunkResult(item, intent)) return false;
      const classified = classifySearchResult(item, question);
      if (classified.role !== RESULT_ROLE.CANDIDATE) return false;
      const host = String(item.url || '').toLowerCase();
      if (/(chatgpt\.com|openai\.com|claude\.ai|anthropic\.com|gemini\.google|deepai\.org|visitcalifornia\.com|dictionary\.com|fortnite)/i.test(host)
        && !/\b(chatgpt|openai|claude|gemini|deepai)\b/i.test(question)) {
        return false;
      }
      if (/\.gov(\/|$)/i.test(host) && !/\b(government|campus|\.gov)\b/i.test(question)) return false;
      if (onTopic(item, question, intent)) return true;
      if (productQuery && onTopic(item, productQuery, intent) && !strict) return true;
      if (p.slice && onTopic(item, p.slice, intent) && !strict) return true;
      if (strict) return false;
      return looksLikeCompany(item);
    });
  }

  async execute(objective, decision, catalogue, input = {}) {
    const startedAt = Date.now();
    objective.status = OBJECTIVE_STATUS.RUNNING;
    objective.delegation = {
      ...(objective.delegation || {}),
      ...decision,
      maxConcurrentWorkers: this.maxConcurrentWorkers,
      maxWorkersPerObjective: this.maxWorkersPerObjective
    };
    if ((!objective.context.slices || !objective.context.slices.length) && decision.slices?.length) {
      objective.context.slices = decision.slices;
    }
    const specialists = (objective.specialists || []).length
      ? objective.specialists
      : this.compose(objective, decision, catalogue);
    objective.specialists = specialists;
    this.engine.persist(objective);

    const byId = new Map(specialists.map((s) => [s.specialistId, s]));
    const remaining = specialists.filter((s) =>
      s.role !== 'synthesizer'
      && s.role !== 'critic'
      && s.role !== 'repair'
      && s.status !== SPECIALIST_STATUS.COMPLETED
      && s.status !== SPECIALIST_STATUS.PARTIAL
      && s.status !== SPECIALIST_STATUS.CANCELLED
    );

    const runWave = async (wave) => {
      await mapLimit(wave, this.maxConcurrentWorkers, async (spec) => {
        if (objective.status === OBJECTIVE_STATUS.CANCELLED || objective.status === OBJECTIVE_STATUS.PAUSED) {
          spec.status = objective.status === OBJECTIVE_STATUS.CANCELLED ? SPECIALIST_STATUS.CANCELLED : SPECIALIST_STATUS.WAITING;
          return;
        }
        await this.runSpecialist(spec, objective, catalogue, input, byId);
        this.engine.persist(objective);
      });
    };

    while (remaining.some((s) => s.status === SPECIALIST_STATUS.CREATED || s.status === SPECIALIST_STATUS.READY || s.status === SPECIALIST_STATUS.WAITING)) {
      if (objective.status === OBJECTIVE_STATUS.CANCELLED || objective.status === OBJECTIVE_STATUS.PAUSED) break;
      const ready = remaining.filter((s) => {
        if (s.status !== SPECIALIST_STATUS.CREATED && s.status !== SPECIALIST_STATUS.READY && s.status !== SPECIALIST_STATUS.WAITING) return false;
        return (s.inputRefs || []).every((id) => {
          const dep = byId.get(id);
          return !dep || dep.status === SPECIALIST_STATUS.COMPLETED || dep.status === SPECIALIST_STATUS.PARTIAL;
        });
      });
      if (!ready.length) break;
      for (const spec of ready) spec.status = SPECIALIST_STATUS.READY;
      await runWave(ready);
    }

    const workerPackets = specialists
      .filter((s) => s.role !== 'synthesizer' && s.role !== 'critic')
      .map((s) => ({ specialistId: s.specialistId, role: s.role, result: s.result || emptyResult('failed') }));
    const arbitration = arbitrate(workerPackets);
    objective.arbitration = arbitration;

    let findings = this.keepOnTopic(arbitration.findings, objective);
    let criticResult = null;
    let repair = null;
    if (shouldRunCritic(objective, decision) && objective.status !== OBJECTIVE_STATUS.CANCELLED) {
      let critic = specialists.find((s) => s.role === 'critic');
      if (!critic) {
        critic = createSpecialist({
          objective,
          catalogue,
          role: 'critic',
          mission: 'Check success criteria, evidence, duplicates, and constraint violations. Cannot authorize outreach.'
        });
        specialists.push(critic);
      }
      if (critic.status !== SPECIALIST_STATUS.COMPLETED && critic.status !== SPECIALIST_STATUS.PARTIAL) {
        critic.status = SPECIALIST_STATUS.RUNNING;
        critic.startedAt = critic.startedAt || new Date().toISOString();
        const routed = await this.routeModel(critic, input);
        critic.modelSelected = routed.model;
        critic.modelPreferred = routed.preferredModel;
        critic.modelFallback = routed.fallback === true;
        criticResult = critique(objective, findings);
        critic.result = emptyResult(criticResult.ok ? 'ok' : 'partial', {
          findings,
          recommendations: criticResult.gaps,
          confidence: criticResult.ok ? 0.8 : 0.4
        });
        critic.status = criticResult.ok ? SPECIALIST_STATUS.COMPLETED : SPECIALIST_STATUS.PARTIAL;
        critic.completedAt = new Date().toISOString();
        critic.confidence = critic.result.confidence;
        objective.critic = criticResult;
        this.engine.persist(objective);
      } else {
        criticResult = objective.critic || critique(objective, findings);
      }

      if (criticResult?.recommendRepair && (objective.repairCount || 0) < this.maxRepairCycles) {
        objective.repairCount = (objective.repairCount || 0) + 1;
        const ads = proposeAdaptations({
          quality: criticResult.quality,
          request: { question: objective.rawRequest },
          previousQueries: (decision.slices || []).map((s) => ({ query: s }))
        });
        const adaptedSlice = ads[0]?.queries?.[0] || decision.slices?.[0] || objective.context?.industry;
        repair = specialists.find((s) => s.role === 'repair') || createSpecialist({
          objective,
          catalogue,
          role: 'repair',
          mission: `Targeted repair: ${ads[0]?.why || criticResult.recommendRepair.detail || criticResult.recommendRepair.type}. Do not restart the swarm.`,
          slice: adaptedSlice
        });
        if (!specialists.includes(repair)) specialists.push(repair);
        if (repair.status !== SPECIALIST_STATUS.COMPLETED && repair.status !== SPECIALIST_STATUS.PARTIAL) {
          await this.runSpecialist(repair, objective, catalogue, input, byId);
        }
        const repaired = repair.result?.findings || [];
        findings = this.keepOnTopic(arbitrate([...workerPackets, { specialistId: repair.specialistId, result: repair.result }]).findings, objective);
        criticResult = critique(objective, findings);
        objective.critic = criticResult;
        objective.repair = {
          specialistId: repair.specialistId,
          gap: criticResult.recommendRepair,
          added: repaired.length,
          adaptation: ads[0] || null
        };
        this.engine.persist(objective);
      }
    }

    const synthesizer = specialists.find((s) => s.role === 'synthesizer');
    if (synthesizer && synthesizer.status !== SPECIALIST_STATUS.COMPLETED && objective.status !== OBJECTIVE_STATUS.CANCELLED) {
      synthesizer.task.inputs = { findings };
      await this.runSpecialist(synthesizer, objective, catalogue, { ...input, findings }, byId);
    }

    const topN = Number(objective.context?.topN || 5);
    findings = this.keepOnTopic(findings, objective);
    criticResult = critique(objective, findings);
    findings = criticResult.clean || findings;
    objective.critic = criticResult;
    const synthesized = this.keepOnTopic(synthesizer?.result?.findings || [], objective);
    const ranked = (synthesized.length ? synthesized : findings);
    const top = ranked.slice(0, topN);
    const comparison = synthesizer?.result?.recommendations?.[0] || synthesizer?.result?.comparison || null;
    objective.result = {
      prospects: findings,
      top,
      report: this.formatReport(objective, specialists, top, comparison),
      comparison,
      providers: [...new Set(specialists.flatMap((s) => s.executions || []).map((e) => e.provider).filter(Boolean))],
      specialists: specialists.map((s) => ({
        specialistId: s.specialistId,
        role: s.role,
        slice: s.slice,
        status: s.status,
        model: s.modelSelected,
        fallback: s.modelFallback,
        allowedCapabilities: s.allowedCapabilities
      })),
      arbitration,
      critic: criticResult,
      quality: criticResult?.quality || null,
      rejected: (criticResult?.occupying || []).map((p) => ({
        title: p.organizationName || p.name,
        url: p.website,
        reason: p.classification?.reasons?.join(',')
      })),
      contacted: false
    };
    objective.contacted = false;
    const failedCore = specialists.filter((s) => s.role === 'scout' && s.status === SPECIALIST_STATUS.FAILED);
    objective.status = objective.status === OBJECTIVE_STATUS.CANCELLED
      ? OBJECTIVE_STATUS.CANCELLED
      : (failedCore.length && findings.length === 0 ? OBJECTIVE_STATUS.FAILED : OBJECTIVE_STATUS.COMPLETED);
    if (objective.status === OBJECTIVE_STATUS.FAILED && !objective.error) {
      objective.error = failedCore.map((s) => s.error).filter(Boolean).join('; ');
    }
    this.engine.persist(objective);
    if (objective.status === OBJECTIVE_STATUS.COMPLETED) {
      try { await this.engine.ingestIntel?.(objective); } catch { /* intel optional */ }
    }
    return {
      status: objective.status === OBJECTIVE_STATUS.COMPLETED ? 'ok' : objective.status,
      objective,
      result: objective.result,
      report: objective.result.report,
      contacted: false,
      durationMs: Date.now() - startedAt,
      wallClockMs: Date.now() - startedAt,
      specialistDurations: specialists.map((s) => ({
        specialistId: s.specialistId,
        role: s.role,
        ms: s.startedAt && s.completedAt ? Date.parse(s.completedAt) - Date.parse(s.startedAt) : null
      }))
    };
  }

  async routeModel(specialist, input = {}) {
    if (!this.engine.router) {
      return { model: null, preferredModel: null, fallback: false, status: 'skipped' };
    }
    const route = this.engine.router.select({
      taskClass: specialist.modelTaskClass || TASK_CLASS.CHAT,
      forceUnavailableModels: input.forceUnavailableModels || []
    });
    if (specialist.role === 'scout' || specialist.role === 'researcher' || specialist.role === 'contact-researcher' || specialist.role === 'repair' || specialist.role === 'source-scout' || specialist.role === 'entity-researcher') {
      return {
        model: route.selectedModel || route.preferredModel,
        preferredModel: route.preferredModel,
        fallback: route.fallback === true,
        status: 'selected'
      };
    }
    try {
      const completion = await this.engine.router.complete({
        taskClass: specialist.modelTaskClass || TASK_CLASS.SUMMARIZATION,
        prompt: [
          packContext(specialist, this.engine.get(specialist.objectiveId) || {}, { findings: input.findings || [] }).untrustedDataPolicy,
          `Role: ${specialist.role}. Mission: ${specialist.mission}`,
          'Return JSON {"ok":true,"summary":"..."} using only supplied evidence.',
          JSON.stringify((input.findings || []).slice(0, 12).map((p) => ({
            name: p.organizationName || p.name,
            website: p.website,
            description: p.description
          })))
        ].join('\n'),
        structuredOutputRequired: true,
        forceUnavailableModels: input.forceUnavailableModels || []
      });
      return {
        model: completion.model,
        preferredModel: completion.preferredModel,
        fallback: completion.fallback === true,
        fallbackReason: completion.fallbackReason,
        status: completion.status,
        text: completion.text,
        parsed: completion.parsed
      };
    } catch (error) {
      return { model: null, preferredModel: route.preferredModel, fallback: false, status: 'failed', error: error.message };
    }
  }

  async invokeGranted(specialist, capabilityId, input, context) {
    if (isOutboundCapability(capabilityId) || specialist.prohibitedCapabilities.includes(capabilityId)) {
      return {
        success: false,
        blocked: true,
        error: `${capabilityId} is prohibited for specialist ${specialist.role}`,
        result: { status: 'blocked', error: 'constraint/least-privilege' }
      };
    }
    if (!isGranted(specialist, capabilityId)) {
      return {
        success: false,
        blocked: true,
        error: `${capabilityId} is not granted to ${specialist.role}`,
        result: { status: 'blocked', error: 'not-granted' }
      };
    }
    if ((specialist.executions || []).length >= (specialist.maxActions || 6)) {
      return { success: false, error: 'specialist maxActions exceeded', result: { status: 'failed', error: 'budget' } };
    }
    try {
      return await this.engine.invokeNode(
        { capabilityId, approvalState: 'not-required', provider: null },
        input,
        context
      );
    } catch (error) {
      return { success: false, error: error.message, result: null };
    }
  }

  async runSpecialist(specialist, objective, catalogue, input, byId) {
    specialist.status = SPECIALIST_STATUS.RUNNING;
    specialist.startedAt = specialist.startedAt || new Date().toISOString();
    const routed = await this.routeModel(specialist, input);
    specialist.modelSelected = routed.model;
    specialist.modelPreferred = routed.preferredModel;
    specialist.modelFallback = routed.fallback === true;
    specialist.modelFallbackReason = routed.fallbackReason || null;

    const context = {
      actor: `specialist:${specialist.role}`,
      permissions: ['network.read', 'data.read'],
      bypassPermissions: true,
      forceUnavailable: [
        ...(input.forceUnavailable || []),
        ...Object.keys(this.engine.fabric?.healthOverlay?.() || {})
      ],
      healthOverlay: this.engine.fabric?.healthOverlay?.() || {},
      allowFallback: true
    };

    const deps = (specialist.inputRefs || []).map((id) => byId.get(id)).filter(Boolean);
    const upstream = deps.flatMap((d) => d.result?.findings || []);

    try {
      if (specialist.role === 'scout' || specialist.role === 'repair') {
        const cap = pickCapability(catalogue, specialist.allowedCapabilities.filter((id) => id === 'org.discover' || id === 'web.search' || id === 'web.scrape'));
        if (!cap) {
          specialist.status = SPECIALIST_STATUS.FAILED;
          specialist.error = 'no discovery capability granted';
          specialist.result = emptyResult('failed', { errors: [specialist.error] });
          specialist.completedAt = new Date().toISOString();
          return;
        }
        const slice = specialist.slice || specialist.scope?.industry;
        const bogusSlice = !slice || /^(general|landscape)$/i.test(slice);
        const query = bogusSlice
          ? (specialist.scope?.query || objective.context?.query || objective.rawRequest)
          : `${slice} ${specialist.scope?.location || objective.context?.location || ''}`.replace(/\s+/g, ' ').trim();
        const invocation = await this.invokeGranted(specialist, cap, {
          query,
          industry: bogusSlice ? (objective.context?.industry || null) : slice,
          location: specialist.scope?.location || objective.context?.location,
          maxOrganizations: specialist.scope?.findN || 5,
          objective: wrapUntrusted(objective.rawRequest)
        }, context);
        specialist.executions.push({
          capability: cap,
          provider: invocation.provider,
          status: invocation.success === false ? 'failed' : 'ok',
          error: invocation.error || null,
          cost: invocation.cost || 0
        });
        objective.cost = (objective.cost || 0) + (invocation.cost || 0);
        const intent = discoveryIntent(query, objective.rawRequest);
        const findings = (invocation.result?.prospects || invocation.result?.organizations || []).map((p) => ({
          ...p,
          slice: specialist.slice
        })).filter((p) => {
          const item = { title: p.organizationName || p.name, url: p.website || p.sourceUrl, snippet: p.description };
          if (!item.title) return false;
          if (isJunkResult(item, intent)) return false;
          if (!onTopic(item, objective.rawRequest, intent) && !onTopic(item, query, intent)) return false;
          return looksLikeCompany(item) || Boolean(p.domain && p.organizationName);
        });
        specialist.result = emptyResult(findings.length ? 'ok' : 'partial', {
          findings,
          evidence: findings.map((p) => ({ name: p.organizationName, website: p.website, source: cap })),
          sourceRefs: findings.map((p) => p.website).filter(Boolean),
          confidence: findings.length ? 0.7 : 0.2,
          errors: invocation.error ? [invocation.error] : []
        });
      } else if (specialist.role === 'researcher') {
        const cap = pickCapability(catalogue, ['company.research.batch', 'company.research']);
        const list = upstream.length ? upstream : (input.findings || []);
        if (!cap || !isGranted(specialist, cap)) {
          specialist.result = emptyResult('partial', { findings: list, unknowns: ['research capability not granted'] });
        } else {
          const invocation = await this.invokeGranted(specialist, cap, { prospects: list, organizations: list }, context);
          specialist.executions.push({
            capability: cap,
            provider: invocation.provider,
            status: invocation.success === false ? 'failed' : 'ok',
            error: invocation.error || null,
            cost: invocation.cost || 0
          });
          objective.cost = (objective.cost || 0) + (invocation.cost || 0);
          specialist.result = emptyResult('ok', {
            findings: invocation.result?.prospects || list,
            evidence: (invocation.result?.prospects || []).map((p) => ({
              name: p.organizationName,
              website: p.website,
              description: p.description
            })),
            confidence: 0.75
          });
        }
      } else if (specialist.role === 'contact-researcher') {
        const cap = pickCapability(catalogue, ['contact.discover.batch', 'contact.discover']);
        const list = upstream.length ? upstream : (input.findings || []);
        if (!cap || !isGranted(specialist, cap)) {
          specialist.result = emptyResult('partial', { findings: list, unknowns: ['contact capability not granted'] });
        } else {
          const invocation = await this.invokeGranted(specialist, cap, {
            prospects: list,
            objective: wrapUntrusted(objective.rawRequest),
            skipApollo: true
          }, context);
          specialist.executions.push({
            capability: cap,
            provider: invocation.provider,
            status: invocation.success === false ? 'failed' : 'ok',
            cost: invocation.cost || 0
          });
          specialist.result = emptyResult('ok', {
            findings: invocation.result?.prospects || list,
            confidence: 0.6
          });
        }
      } else if (specialist.role === 'source-scout') {
        const cap = pickCapability(catalogue, ['intelligence.research', 'org.discover', 'web.search']);
        if (!cap || !isGranted(specialist, cap)) {
          specialist.result = emptyResult('partial', { findings: upstream, unknowns: ['source-scout capability not granted'] });
        } else {
          const invocation = await this.invokeGranted(specialist, cap, {
            question: specialist.scope?.query || objective.context?.query || objective.rawRequest,
            query: specialist.scope?.query || objective.context?.query,
            objective: wrapUntrusted(objective.rawRequest),
            quantity: specialist.scope?.findN || 10,
            location: objective.context?.location,
            slices: specialist.scope?.slices || objective.context?.slices || []
          }, context);
          specialist.executions.push({
            capability: cap,
            provider: invocation.provider,
            status: invocation.success === false ? 'failed' : 'ok',
            cost: invocation.cost || 0
          });
          specialist.result = emptyResult('ok', {
            findings: invocation.result?.prospects || invocation.result?.entities || upstream,
            evidence: invocation.result?.evidence || [],
            confidence: 0.65
          });
        }
      } else if (specialist.role === 'verifier') {
        const cap = pickCapability(catalogue, ['intelligence.verify']);
        const first = (upstream[0] || {});
        if (!cap || !isGranted(specialist, cap)) {
          specialist.result = emptyResult('partial', { findings: upstream, unknowns: ['verify not granted'] });
        } else {
          const invocation = await this.invokeGranted(specialist, cap, {
            entity: first.organizationName || first.name,
            predicate: 'described_as'
          }, context);
          specialist.executions.push({ capability: cap, provider: invocation.provider, status: 'ok' });
          specialist.result = emptyResult('ok', {
            findings: upstream,
            evidence: invocation.result?.evidence || [],
            recommendations: [`verify ${invocation.result?.status || 'insufficient-evidence'}`],
            confidence: 0.5
          });
        }
      } else if (specialist.role === 'market-mapper') {
        const cap = pickCapability(catalogue, ['intelligence.market-map', 'objective.report']);
        if (cap && isGranted(specialist, cap)) {
          const invocation = await this.invokeGranted(specialist, cap, {
            question: objective.rawRequest,
            prospects: upstream,
            objective: objective.rawRequest
          }, context);
          specialist.executions.push({ capability: cap, provider: invocation.provider, status: 'ok' });
          specialist.result = emptyResult('ok', {
            findings: invocation.result?.entities || invocation.result?.prospects || upstream,
            recommendations: (invocation.result?.market?.gaps || []).map((g) => g.detail || g),
            confidence: 0.6
          });
        } else {
          specialist.result = emptyResult('ok', { findings: upstream, confidence: 0.5 });
        }
      } else if (specialist.role === 'synthesizer' || specialist.role === 'comparator') {
        const list = input.findings || upstream;
        const cap = pickCapability(catalogue, ['objective.report']);
        if (cap && isGranted(specialist, cap)) {
          const invocation = await this.invokeGranted(specialist, cap, {
            prospects: list,
            topN: objective.context?.topN || 5,
            objective: objective.rawRequest
          }, context);
          specialist.executions.push({
            capability: cap,
            provider: invocation.provider,
            status: 'ok',
            cost: invocation.cost || 0
          });
          specialist.result = emptyResult('ok', {
            findings: invocation.result?.top || list.slice(0, objective.context?.topN || 5),
            recommendations: [invocation.result?.report || routed.text].filter(Boolean),
            comparison: routed.parsed?.summary || routed.text || invocation.result?.report,
            confidence: 0.7
          });
        } else {
          specialist.result = emptyResult('ok', {
            findings: list.slice(0, objective.context?.topN || 5),
            comparison: routed.text || null,
            confidence: 0.5
          });
        }
      } else {
        specialist.result = emptyResult('ok', { findings: upstream, confidence: 0.5 });
      }

      const check = validateSpecialistResult(specialist.result);
      if (!check.ok) {
        specialist.result.errors = [...(specialist.result.errors || []), ...check.errors];
        specialist.status = SPECIALIST_STATUS.PARTIAL;
      } else if (!specialist.result.findings.length && specialist.role === 'scout') {
        specialist.status = SPECIALIST_STATUS.PARTIAL;
      } else {
        specialist.status = SPECIALIST_STATUS.COMPLETED;
      }
      specialist.confidence = specialist.result.confidence;
    } catch (error) {
      logger.warn(`Specialist ${specialist.role} failed: ${error.message}`);
      specialist.status = SPECIALIST_STATUS.FAILED;
      specialist.error = error.message;
      specialist.result = emptyResult('failed', { errors: [error.message] });
    }
    specialist.completedAt = new Date().toISOString();
  }

  formatReport(objective, specialists, top, comparison) {
    const lines = [
      `Objective ${objective.objectiveId} ${objective.status} via bounded specialists.`,
      `Delegation: ${objective.delegation?.reason || 'n/a'}`,
      `Workers: ${specialists.map((s) => `${s.role}${s.slice ? `(${s.slice})` : ''} ${s.status} model=${s.modelSelected || 'n/a'}`).join('; ')}`,
      `${(objective.result?.prospects || top).length} organizations. Discovered prospects contacted: 0.`,
      ...top.slice(0, objective.context?.topN || 5).map((p, i) => `#${i + 1} ${p.organizationName || p.name} · ${p.website || 'no site'} · ${String(p.description || '').slice(0, 80)}`)
    ];
    if (comparison) lines.push(`\nSynthesis:\n${typeof comparison === 'string' ? comparison : JSON.stringify(comparison)}`);
    return lines.join('\n');
  }
}
