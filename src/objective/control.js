const CONTROL_PATTERNS = [
  { action: 'status', re: /what are you working on|what(?:'s| is) (the )?(current )?objective|objective status/i },
  { action: 'plan', re: /show me the plan|what(?:'s| is) the (execution )?plan/i },
  { action: 'why', re: /why did you (choose|use|pick)|why apollo|why (the )?spider|why firecrawl/i },
  { action: 'failed', re: /what failed|what went wrong|show (me )?failures/i },
  { action: 'retry', re: /try another way|try a different (provider|way)|replan/i },
  { action: 'skip', re: /skip that step|skip this step/i },
  { action: 'stop', re: /^(stop|cancel|abort)(\b| the objective)/i },
  { action: 'resume', re: /^resume(\b| the objective)/i },
  { action: 'blocking', re: /what(?:'s| is) blocking|waiting on approval/i },
  { action: 'cost', re: /how much has this cost|what(?:'s| is) the cost/i },
  { action: 'no-contact', re: /don'?t call anyone|do not call anyone|finish everything except outreach/i }
];

export function matchObjectiveControl(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  for (const item of CONTROL_PATTERNS) {
    if (item.re.test(value)) return { action: item.action, query: value };
  }
  return null;
}

export function matchObjectiveRun(text) {
  const value = String(text || '').trim();
  if (!value) return null;
  if (matchObjectiveControl(value)) return null;
  if (/prepare (an |the )?(outreach )?campaign/i.test(value)) return null;
  const looks = /(find|research|rank|qualify|discover).{0,80}(compan|exhibitor|prospect|roofer|decision maker)/i.test(value)
    || /(do not contact|don't contact)/i.test(value);
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
  if (record.result?.report) lines.push(record.result.report);
  if (record.error) lines.push(`Error: ${record.error}`);
  return lines.filter(Boolean).join('\n');
}
