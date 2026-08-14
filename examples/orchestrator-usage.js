/**
 * ORCHESTRATOR USAGE EXAMPLES
 *
 * Phase 1.3: Demonstrates multi-agent swarm coordination
 * using the rewired orchestrator with all Phase 1 registries.
 */

/**
 * Example 1: Spawn a swarm for landing page creation
 */
async function example1_createLandingPage(orchestrator, userId, projectId) {
  console.log('=== Example 1: Create Landing Page with Swarm ===');

  const result = await orchestrator.spawnSwarm(
    'create_landing_page',
    userId,
    projectId,
    {
      url: 'https://my-startup.com',
      industry: 'SaaS',
      value_prop: 'AI-powered automation',
      target_audience: 'SMB founders'
    },
    {
      priority: 'high',
      maxAttempts: 3,
      timeout: 60000
    }
  );

  console.log('Swarm spawned:', {
    swarmId: result.swarmId,
    jobId: result.jobId,
    agents: result.agents,
    estimatedCost: result.estimatedCost,
    status: result.status
  });

  return result.swarmId;
}

/**
 * Example 2: Monitor swarm progress
 */
async function example2_monitorSwarmProgress(orchestrator, swarmId) {
  console.log('=== Example 2: Monitor Swarm Progress ===');

  // Poll status periodically
  for (let i = 0; i < 10; i++) {
    const status = await orchestrator.getSwarmStatus(swarmId);

    console.log(`[${new Date().toISOString()}] Swarm ${swarmId}:`, {
      status: status.status,
      agents: status.agents.length,
      messages: status.messageCount,
      cost: status.actualCost
    });

    if (status.status === 'completed' || status.status === 'failed') {
      break;
    }

    // Wait 2 seconds before checking again
    await new Promise(resolve => setTimeout(resolve, 2000));
  }
}

/**
 * Example 3: Get aggregated results from swarm
 */
async function example3_aggregateResults(orchestrator, swarmId) {
  console.log('=== Example 3: Aggregate Swarm Results ===');

  const results = await orchestrator.aggregateResults(swarmId);

  console.log('Results:', {
    success: results.success,
    resultCount: results.results.length,
    summary: results.summary,
    totalCost: results.total_cost,
    duration: results.duration_seconds,
    outputs: results.results.map(r => ({
      agent: r.agent,
      timestamp: r.timestamp
    }))
  });

  return results;
}

/**
 * Example 4: Execute task requiring specialized agents
 */
async function example4_leadGenerationSwarm(orchestrator, userId, projectId) {
  console.log('=== Example 4: Lead Generation Swarm ===');

  const result = await orchestrator.spawnSwarm(
    'generate_qualified_leads',
    userId,
    projectId,
    {
      industry: 'e-commerce',
      location: 'United States',
      company_size: 'mid-market',
      count: 50
    },
    {
      priority: 'normal',
      roleDistribution: 'mixed'
    }
  );

  console.log('Lead generation swarm spawned:');
  console.log('- Agents involved:', result.agents.map(a => a.name).join(', '));
  console.log('- Estimated cost:', result.estimatedCost);
  console.log('- Job ID:', result.jobId);

  return result.swarmId;
}

/**
 * Example 5: Cancel swarm if it exceeds budget
 */
async function example5_cancelSwarmOverBudget(orchestrator, swarmId) {
  console.log('=== Example 5: Cancel Swarm (Over Budget) ===');

  const status = await orchestrator.getSwarmStatus(swarmId);

  if (status.actualCost > 50) {
    console.log(`Swarm cost (${status.actualCost}) exceeds budget, cancelling...`);

    const result = await orchestrator.cancelSwarm(swarmId, 'budget_limit_exceeded');

    console.log('Swarm cancelled:', result);
  } else {
    console.log('Swarm within budget, continuing...');
  }
}

/**
 * Example 6: View orchestrator statistics
 */
async function example6_getOrchstratorStats(orchestrator) {
  console.log('=== Example 6: Orchestrator Statistics ===');

  const stats = orchestrator.getStats();

  console.log('Active Swarms:', stats.active_swarms);
  console.log('Swarm Details:');
  for (const swarm of stats.swarms) {
    console.log(`  - ${swarm.id}:`);
    console.log(`    Task: ${swarm.task}`);
    console.log(`    Agents: ${swarm.agents}`);
    console.log(`    Status: ${swarm.status}`);
    console.log(`    Age: ${swarm.age_seconds}s`);
  }
}

/**
 * Example 7: Chain multiple tasks into DAG workflow
 */
async function example7_complexWorkflow(orchestrator, planningDAG, userId, projectId) {
  console.log('=== Example 7: Complex Workflow (DAG) ===');

  // Create workflow: research -> content -> landing page
  const workflow = await planningDAG.createWorkflow('marketing-campaign', {
    user_id: userId,
    project_id: projectId
  });

  // Step 1: Market research (independent)
  const step1 = await planningDAG.addStep(workflow.id, {
    name: 'research_market',
    agent_type: 'strategy-market',
    parameters: { industry: 'SaaS' }
  });

  // Step 2: Competitor analysis (depends on research)
  const step2 = await planningDAG.addStep(workflow.id, {
    name: 'analyze_competitors',
    agent_type: 'strategy-market',
    parameters: { industry: 'SaaS' }
  });

  // Step 3: Create content (depends on research)
  const step3 = await planningDAG.addStep(workflow.id, {
    name: 'create_marketing_content',
    agent_type: 'strategy-marketing',
    parameters: { format: 'web_copy' }
  });

  // Step 4: Build landing page (depends on research + content)
  const step4 = await planningDAG.addStep(workflow.id, {
    name: 'build_landing_page',
    agent_type: 'dev-fullstack',
    parameters: { template: 'modern_saas' }
  });

  // Define dependencies
  await planningDAG.addDependency(workflow.id, step2, step1); // competitor analysis needs research
  await planningDAG.addDependency(workflow.id, step3, step1); // content needs research
  await planningDAG.addDependency(workflow.id, step4, [step1, step3]); // page needs research + content

  // Get execution order (topological sort)
  const executionOrder = await planningDAG.getExecutionOrder(workflow.id);

  console.log('Workflow DAG created:');
  console.log('Execution Order:', executionOrder.map(id => id.slice(0, 8)).join(' -> '));
  console.log('Total steps:', executionOrder.length);

  return workflow.id;
}

/**
 * Example 8: Complete end-to-end swarm lifecycle
 */
async function example8_endToEnd(orchestrator, userId, projectId) {
  console.log('\n=== Example 8: Complete End-to-End Lifecycle ===\n');

  // Step 1: Spawn swarm
  console.log('Step 1: Spawn swarm...');
  const swarmResult = await orchestrator.spawnSwarm(
    'create_marketing_campaign',
    userId,
    projectId,
    {
      campaign_name: 'Product Launch 2026',
      target_market: 'Enterprise SaaS',
      budget_allocation: { content: 30, ads: 50, analytics: 20 }
    }
  );

  if (!swarmResult.success) {
    console.log('❌ Swarm spawn failed:', swarmResult.error);
    return;
  }

  const { swarmId } = swarmResult;
  console.log('✅ Swarm spawned:', swarmId);
  console.log('   Agents:', swarmResult.agents.map(a => a.name).join(', '));

  // Step 2: Wait for completion (simulate)
  console.log('\nStep 2: Waiting for agents to execute...');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // Step 3: Get final status
  console.log('\nStep 3: Check final status...');
  const finalStatus = await orchestrator.getSwarmStatus(swarmId);
  console.log('✅ Final status:', {
    status: finalStatus.status,
    messageCount: finalStatus.messageCount,
    cost: finalStatus.actualCost
  });

  // Step 4: Aggregate results
  console.log('\nStep 4: Aggregate results...');
  const aggregated = await orchestrator.aggregateResults(swarmId);
  console.log('✅ Results aggregated:', {
    outputs: aggregated.results.length,
    summary: aggregated.summary,
    totalCost: aggregated.total_cost,
    duration: aggregated.duration_seconds
  });

  console.log('\n✅ End-to-end example complete!');
}

export {
  example1_createLandingPage,
  example2_monitorSwarmProgress,
  example3_aggregateResults,
  example4_leadGenerationSwarm,
  example5_cancelSwarmOverBudget,
  example6_getOrchstratorStats,
  example7_complexWorkflow,
  example8_endToEnd
};
