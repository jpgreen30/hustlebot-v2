/**
 * Truthful Day-1 health snapshot.
 * Never reports HEALTHY solely because an environment variable exists.
 */

const STATES = ['HEALTHY', 'DEGRADED', 'UNAVAILABLE', 'MISCONFIGURED', 'UNVERIFIED'];

function envSet(name) {
  return Boolean(process.env[name] && String(process.env[name]).trim());
}

async function safe(label, fn) {
  try {
    return await fn();
  } catch (error) {
    return { state: 'UNAVAILABLE', detail: `${label} probe failed: ${error.message}` };
  }
}

export async function collectDay1Health(server = {}) {
  const telegram = await safe('telegram', async () => {
    if (!process.env.TELEGRAM_BOT_TOKEN) {
      return { state: 'MISCONFIGURED', detail: 'TELEGRAM_BOT_TOKEN not set' };
    }
    if (!server.bot?.telegram?.getMe) {
      return { state: 'UNAVAILABLE', detail: 'Telegram bot not initialized' };
    }
    const me = await server.bot.telegram.getMe();
    return {
      state: 'HEALTHY',
      detail: me?.username ? `@${me.username}` : 'getMe ok'
    };
  });

  const deepgram = await safe('deepgram', async () => {
    if (!process.env.DEEPGRAM_API_KEY) {
      return { state: 'MISCONFIGURED', detail: 'DEEPGRAM_API_KEY not set' };
    }
    if (!server.voice) {
      return { state: 'UNAVAILABLE', detail: 'voice client not initialized' };
    }
    const response = await fetch('https://api.deepgram.com/v1/projects', {
      headers: { Authorization: `Token ${process.env.DEEPGRAM_API_KEY}` }
    });
    if (response.status === 401 || response.status === 403) {
      return { state: 'MISCONFIGURED', detail: `Deepgram auth failed (${response.status})` };
    }
    if (!response.ok) {
      return { state: 'DEGRADED', detail: `Deepgram projects HTTP ${response.status}` };
    }
    return { state: 'HEALTHY', detail: 'projects ok' };
  });

  const openrouter = await safe('openrouter', async () => {
    if (!process.env.OPENROUTER_API_KEY) {
      return { state: 'MISCONFIGURED', detail: 'OPENROUTER_API_KEY not set' };
    }
    if (!server.llm) {
      return { state: 'UNAVAILABLE', detail: 'LLM client not initialized' };
    }
    const response = await fetch('https://openrouter.ai/api/v1/models', {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }
    });
    if (response.status === 401 || response.status === 403) {
      return { state: 'MISCONFIGURED', detail: `OpenRouter auth failed (${response.status})` };
    }
    if (!response.ok) {
      return { state: 'DEGRADED', detail: `OpenRouter models HTTP ${response.status}` };
    }
    return { state: 'HEALTHY', detail: 'models ok' };
  });

  const retell = await safe('retell', async () => {
    if (server.retellIntegration?.getHealth) {
      return server.retellIntegration.getHealth();
    }
    if (!process.env.RETELL_API_KEY) {
      return { state: 'MISCONFIGURED', detail: 'RETELL_API_KEY not set' };
    }
    return { state: 'UNAVAILABLE', detail: 'Retell integration not initialized' };
  });

  const n8n = await safe('n8n', async () => {
    if (server.n8nIntegration?.getHealth) {
      return server.n8nIntegration.getHealth();
    }
    if (!process.env.N8N_WEBHOOK_URL && !process.env.N8N_TEST_WEBHOOK_URL) {
      return { state: 'MISCONFIGURED', detail: 'N8N_WEBHOOK_URL not set' };
    }
    return { state: 'UNAVAILABLE', detail: 'n8n integration not initialized' };
  });

  const heygen = await safe('heygen', async () => {
    if (server.videoFactory?.getHealth) {
      return server.videoFactory.getHealth();
    }
    if (!process.env.HEYGEN_API_KEY && !process.env.HEYGENAPI_KEY) {
      return { state: 'MISCONFIGURED', detail: 'HEYGEN_API_KEY not set' };
    }
    return { state: 'UNAVAILABLE', detail: 'video factory not initialized' };
  });

  const redis = await safe('redis', async () => {
    if (!envSet('REDIS_URL')) {
      return { state: 'MISCONFIGURED', detail: 'REDIS_URL not set' };
    }
    if (server.mailbox?.initialized && server.mailbox.redis) {
      const pong = await server.mailbox.redis.ping();
      return { state: pong === 'PONG' ? 'HEALTHY' : 'DEGRADED', detail: `ping ${pong}` };
    }
    return { state: 'UNAVAILABLE', detail: 'Redis mailbox not initialized' };
  });

  const supabase = await safe('supabase', async () => {
    if (!envSet('SUPABASE_URL') || !(envSet('SUPABASE_KEY') || envSet('SUPABASE_SERVICE_KEY'))) {
      return { state: 'MISCONFIGURED', detail: 'SUPABASE_URL/KEY not set' };
    }
    if (!server.db) {
      return { state: 'UNAVAILABLE', detail: 'database client not initialized' };
    }
    return { state: 'HEALTHY', detail: 'database client attached' };
  });

  const firecrawl = await safe('firecrawl', async () => {
    if (server.firecrawlProvider?.getHealth) return server.firecrawlProvider.getHealth();
    if (server.scrapingIntegration?.getHealth) return server.scrapingIntegration.getHealth();
    if (!process.env.FIRECRAWL_API_KEY) {
      return { state: 'MISCONFIGURED', detail: 'FIRECRAWL_API_KEY not set' };
    }
    return { state: 'UNAVAILABLE', detail: 'Firecrawl provider not initialized' };
  });

  const spider = await safe('spider', async () => {
    if (server.spiderProvider?.getHealth) return server.spiderProvider.getHealth();
    return { state: 'UNAVAILABLE', detail: 'custom spider not initialized' };
  });

  const browser = await safe('browser', async () => {
    if (server.browserProvider?.getHealth) return server.browserProvider.getHealth();
    return { state: 'UNAVAILABLE', detail: 'browser render provider not initialized' };
  });

  const apollo = await safe('apollo', async () => {
    if (server.apolloProvider?.getHealth) return server.apolloProvider.getHealth();
    if (!process.env.APOLLO_API_KEY) {
      return { state: 'UNAVAILABLE', detail: 'APOLLO_API_KEY not set' };
    }
    return { state: 'UNAVAILABLE', detail: 'Apollo provider not initialized' };
  });

  const email = await safe('email', async () => {
    if (server.outreachEmail?.getHealth) return server.outreachEmail.getHealth();
    if (!process.env.BREVO_API_KEY) {
      return { state: 'UNAVAILABLE', detail: 'BREVO_API_KEY not set' };
    }
    return { state: 'UNAVAILABLE', detail: 'outreach email provider not initialized' };
  });

  const durableRuntime = await safe('durableRuntime', async () => {
    if (server.durableRuntime?.health) return server.durableRuntime.health();
    return { state: 'UNAVAILABLE', detail: 'durable runtime not initialized' };
  });

  const intel = await safe('intel', async () => {
    if (!server.intelFabric && !server.intelStore) {
      return { state: 'UNAVAILABLE', detail: 'intelligence fabric not initialized' };
    }
    const stats = server.intelStore?.snapshot?.() || {};
    const dur = stats.durability || server.intelStore?.durability || {};
    const supabaseState = dur.supabase || 'UNVERIFIED';
    const state = (!server.intelFabric && !server.intelStore)
      ? 'UNAVAILABLE'
      : (supabaseState === 'DEGRADED' || supabaseState === 'UNAVAILABLE' ? 'DEGRADED' : 'HEALTHY');
    return {
      state,
      detail: `entities=${stats.entitiesStored || 0} claims=${stats.claimsStored || 0} evidence=${stats.evidenceRecords || 0} supabase=${supabaseState}`,
      durability: dur,
      ...stats
    };
  });

  const services = { telegram, deepgram, openrouter, retell, n8n, heygen, redis, supabase, firecrawl, spider, browser, apollo, email, durableRuntime, intel };
  for (const [name, value] of Object.entries(services)) {
    if (!STATES.includes(value.state)) {
      services[name] = { state: 'UNVERIFIED', detail: `invalid state from ${name}` };
    }
  }
  return {
    at: new Date().toISOString(),
    services
  };
}

export function formatDay1StatusText(snapshot) {
  const lines = ['HustleBot Day-1 status', ''];
  for (const [name, check] of Object.entries(snapshot.services || {})) {
    const label = name.padEnd(11, ' ');
    lines.push(`${label} ${check.state}${check.detail ? ` — ${check.detail}` : ''}`);
  }
  lines.push('', `as of ${snapshot.at}`);
  return lines.join('\n');
}

export function isStatusRequest(text) {
  return /^\s*\/?status\s*$/i.test(String(text || ''));
}
