const CONTROL_PATTERNS = [
  { action: 'status', re: /what are you working on|what(?:'s| is) (the )?(current )?objective|objective status/i },
  { action: 'plan', re: /show me the plan|what(?:'s| is) the (execution )?plan/i },
  { action: 'why-delegate', re: /why did you delegate/i },
  { action: 'workers', re: /what are your agents doing|who is working|show me the (research )?workers|how much work is left/i },
  { action: 'worker-findings', re: /what did the .+ (researcher|scout|worker|analyst) find/i },
  { action: 'worker-models', re: /which model is each agent using/i },
  { action: 'worker-tools', re: /what tools did they use/i },
  { action: 'stop-workers', re: /stop all workers/i },
  { action: 'pause', re: /^pause(\b| the objective)/i },
  { action: 'queue', re: /what is queued|what(?:'s| is) in the queue|show (me )?(the )?queue|queued jobs|what will retry/i },
  { action: 'scheduled', re: /what is scheduled|show (me )?(the )?schedules|when does it run next/i },
  { action: 'overnight', re: /what ran overnight|what failed while i was away|overnight report|morning (brief|report)/i },
  { action: 'memory-inspect', re: /what do you remember|operational memory|show (me )?memory/i },
  { action: 'approvals-inspect', re: /what is waiting for approval|pending approvals/i },
  { action: 'why', re: /why did you (choose|use|pick)|why apollo|why (the )?spider|why firecrawl/i },
  { action: 'failed', re: /what failed|what went wrong|show (me )?failures/i },
  { action: 'retry', re: /try another way|try a different (provider|way)|replan/i },
  { action: 'skip', re: /skip that step|skip this step/i },
  { action: 'stop', re: /^(stop|cancel|abort)(\b| the objective)|stop this/i },
  { action: 'resume', re: /^resume(\b| the objective)/i },
  { action: 'blocking', re: /what(?:'s| is) blocking|waiting on approval/i },
  { action: 'cost', re: /how much has this cost|what(?:'s| is) the cost|what did this (objective )?cost/i },
  { action: 'no-contact', re: /don'?t call anyone|do not call anyone|finish everything except outreach|finish without outreach/i },
  { action: 'tools', re: /what tools do you have|which tools|what can you (do|use)|tool catalogue|list (your )?tools/i },
  { action: 'mcp', re: /what mcp servers|mcp servers?( are)? connected|connected mcp/i },
  { action: 'health', re: /is apollo healthy|apollo healthy|provider health|is firecrawl (healthy|up|available)/i },
  { action: 'web-research', re: /what can you use for web research|web research tools/i },
  { action: 'model', re: /which model planned|what model planned|which model (did you|was used)/i },
  { action: 'refresh', re: /refresh (your )?tools|rediscover tools|mcp\.refresh/i },
  { action: 'why-ranked', re: /why is (this|the) company ranked|why (is|was) .+ ranked/i },
  { action: 'sources-used', re: /what sources did you use|which sources did you use|show (me )?sources/i },
  { action: 'show-evidence', re: /show me the evidence|what(?:'s| is) the evidence/i },
  { action: 'uncertain', re: /which facts are uncertain|what is unknown|what(?:'s| is) uncertain/i },
  { action: 'conflicts', re: /what conflicts did you find|show (me )?conflicts/i },
  { action: 'last-verified', re: /when was this last verified|last verified/i },
  { action: 'research-deeper', re: /research this deeper|go deeper|dig deeper/i },
  { action: 'another-source', re: /find another source|try another source/i },
  { action: 'verify-claim', re: /verify this claim|verify that/i },
  { action: 'know-about', re: /what do you know about\s+(.+)/i },
  { action: 'research-quality', re: /how good is this research|research quality/i },
  { action: 'why-searched', re: /why did you search that|why (those|these) quer/i },
  { action: 'why-adapted', re: /why did you change (your )?research strategy|why (did you )?adapt/i },
  { action: 'rejected-results', re: /which results did you reject|what did you reject|rejected results/i },
  { action: 'why-rejected', re: /why was this result rejected|why reject/i },
  { action: 'still-missing', re: /what are we still missing|what(?:'s| is) missing/i },
  { action: 'best-source', re: /what source performed best|best source/i },
  { action: 'first-party-only', re: /show only first-party evidence|first-party evidence/i },
  { action: 'inferred-claims', re: /which claims are inferred|inferred claims/i },
  { action: 'learned-strategy', re: /what did you learn from this research|learned strategy/i }
];

export function matchObjectiveControl(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  for (const item of CONTROL_PATTERNS) {
    const m = value.match(item.re);
    if (m) return { action: item.action, query: value, captured: m[1] || null };
  }
  return null;
}

export function matchObjectiveRun(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  if (matchObjectiveControl(value)) return null;
  if (/prepare (an |the )?(outreach )?campaign/i.test(value)) return null;
  const looks = /(find|research|rank|qualify|discover).{0,80}(compan|exhibitor|prospect|roofer|decision maker|logistics)/i.test(value)
    || /(do not contact|don't contact)/i.test(value)
    || /(logistics|freight|3pl|trucking).{0,80}(compan|compar)/i.test(value)
    || /comparison of their services/i.test(value)
    || /current utc time|what time is it/i.test(value)
    || /competitive landscape|strategic opportunit/i.test(value)
    || /across .{8,}.+\band\b/i.test(value);
  if (!looks) return null;
  return { rawRequest: value };
}

export function formatObjectiveReply(record) {
  if (!record) return 'No objective is loaded.';
  const plan = record.plan;
  const lines = [
    `Objective ${record.objectiveId} · ${record.status}`,
    record.interpretedGoal || record.rawRequest,
    plan ? `Plan ${plan.planId} v${plan.version} (${(plan.nodes || []).map((n) => n.capabilityId).join(' → ')})` : 'No plan yet.'
  ];
  if (record.delegation) {
    lines.push(`Delegation: ${record.delegation.delegate ? `YES (${record.delegation.estimatedWorkers} workers)` : 'NO'} — ${record.delegation.reason}`);
  }
  if (record.result?.report) lines.push(record.result.report);
  if (record.error) lines.push(`Error: ${record.error}`);
  return lines.filter(Boolean).join('\n');
}
