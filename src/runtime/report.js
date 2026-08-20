export function formatMorningReport(objective = {}, extra = {}) {
  const prospects = objective.result?.prospects || [];
  const top = objective.result?.top || prospects.slice(0, 5);
  const failed = (objective.executions || []).filter((e) => e.status !== 'ok' && e.status !== 'SUCCESS' && e.status !== 'partial').length;
  const recovered = (objective.executions || []).filter((e) => /fallback|alternate|retry/i.test(e.reasonSelected || '')).length;
  const names = top.map((p) => p.organizationName || p.name).filter(Boolean);
  return [
    'HUSTLEBOT MORNING REPORT',
    '',
    `Objective: ${objective.interpretedGoal || objective.rawRequest || extra.name || 'research'}`,
    `Objective ID: ${objective.objectiveId || 'n/a'}`,
    `Status: ${objective.status || 'unknown'}`,
    '',
    `Companies discovered: ${prospects.length}`,
    `Researched: ${prospects.filter((p) => p.intelligence || p.description).length}`,
    `Qualified: ${top.length}`,
    `Top opportunities: ${names.join(', ') || 'none yet'}`,
    `Failed tasks: ${failed}`,
    `Recovered tasks: ${recovered}`,
    `Contacted: ${objective.contacted === true ? 1 : 0}`,
    extra.note ? `\n${extra.note}` : ''
  ].filter((line, i, arr) => line !== '' || arr[i - 1] !== '').join('\n').trim();
}

export function formatQueueInspect(stats = {}, jobs = []) {
  const lines = [
    `Queue depth: ${stats.queueLength ?? 0}`,
    `Running: ${stats.activeJobs ?? 0} (this worker ${stats.runningHere ?? 0})`,
    `Dead letter: ${stats.deadLetter ?? 0}`,
    `Durable: ${stats.durable ? 'yes' : 'no'} (${stats.backend || 'unknown'})`,
    ''
  ];
  for (const job of jobs.slice(0, 12)) {
    lines.push(`${job.id} · ${job.type} · ${job.status}${job.availableAt ? ` · available ${new Date(job.availableAt).toISOString()}` : ''}${job.error ? ` · ${job.error}` : ''}`);
  }
  if (!jobs.length) lines.push('No jobs.');
  return lines.join('\n');
}

export function formatScheduleInspect(inspect = {}) {
  const lines = [`Active schedules: ${inspect.active ?? 0}`, `Paused: ${inspect.paused ?? 0}`, ''];
  for (const s of inspect.schedules || []) {
    lines.push(`${s.scheduleId} · ${s.status} · next ${s.nextRunAt || 'n/a'} (${s.timezone}) · ${s.recurrence} · ${s.template}`);
  }
  if (!(inspect.schedules || []).length) lines.push('No schedules.');
  return lines.join('\n');
}
