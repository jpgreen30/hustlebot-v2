# HustleBot v2 - External Integrations

**Version**: 0.1 (Phase 0, 2026-08-14)

Catalog of all external APIs, services, and credentials required for HustleBot v2 operations.

---

## I. LLM & AI Services

### OpenRouter (Currently Used)

**Purpose**: LLM routing across 6+ models  
**Integration**: `src/llm/openrouter.js`

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://openrouter.ai/api/v1` |
| **Authentication** | Bearer token (API key) |
| **Env Var** | `OPENROUTER_API_KEY` |
| **Models** | Deepseek Chat, Moonshot (Kimi), Claude 3.5, GPT-4o, Grok 2, Gemini 2.0, Llama 3.1, Command R+ |
| **Rate Limit** | Varies by model; typically 100 req/min |
| **Cost** | Varies; see `src/llm/openrouter.js` for per-model pricing |
| **Status** | ✅ Live, fully integrated |
| **Fallback** | If key missing, gracefully skip LLM features |

**Authentication**:
```javascript
headers: {
  Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`,
  'HTTP-Referer': 'https://hustlebot.io'
}
```

**Example API Call**:
```javascript
const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
  method: 'POST',
  headers: { Authorization: `Bearer ${apiKey}` },
  body: JSON.stringify({
    model: 'anthropic/claude-3.5-sonnet',
    messages: [{ role: 'user', content: 'Generate 5 headlines...' }],
    max_tokens: 2000
  })
})
```

**Pricing Tiers** (as of 2026-08-14):
- **Deepseek Chat**: $0.14/1M input, $0.28/1M output (ultra-cheap)
- **Claude 3.5 Sonnet**: $3/1M input, $15/1M output (highest quality)
- **GPT-4o**: $5/1M input, $15/1M output
- **Grok 2**: $2/1M input, $10/1M output
- **Gemini 2.0**: $0.075/1M input, $0.30/1M output (ultra-cheap)
- **Llama 3.1 70B**: $0.5/1M input, $1.5/1M output (budget)

---

### Claude API (Phase 1 Candidate)

**Purpose**: Alternative LLM backend (direct from Anthropic)  
**Status**: ⏳ Not yet integrated; reserved for Phase 1 provider abstraction

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://api.anthropic.com/v1/messages` |
| **Authentication** | Bearer token (API key) |
| **Env Var** | `ANTHROPIC_API_KEY` (when enabled) |
| **Models** | Claude 3.5 Sonnet, Claude 3 Opus, Claude 3 Haiku |
| **Rate Limit** | Varies by tier; typically 1000 req/min (Pro) |
| **Cost** | Similar to OpenRouter Claude pricing |
| **SDK** | `npm install @anthropic-ai/sdk` (optional) |
| **Status** | 📋 Phase 1: Add provider abstraction |

**Why Phase 1?**
- Current OpenRouter Claude is sufficient
- Phase 1 adds multi-provider support (swap on-demand)
- Would require abstraction layer (§2.3 MASTER_SPEC)

---

## II. Voice & Speech

### Deepgram (Speech-to-Text)

**Purpose**: Convert voice messages to text  
**Integration**: `src/voice/deepgram.js`

| Property | Value |
|----------|-------|
| **API Endpoint** | WebSocket or REST `https://api.deepgram.com/v1/listen` |
| **Authentication** | Bearer token (API key) |
| **Env Var** | `DEEPGRAM_API_KEY` |
| **SDK** | `@deepgram/sdk@^3.4.0` (in package.json) |
| **Languages** | 30+; default: English (en-US) |
| **Accuracy** | High (>95% for clear audio) |
| **Rate Limit** | ~100 requests/minute |
| **Cost** | ~$0.0043/minute of audio (pay-as-you-go) |
| **Status** | ✅ Optional (graceful fallback if missing) |

**Usage**:
```javascript
const { createClient } = require('@deepgram/sdk');
const dg = createClient(process.env.DEEPGRAM_API_KEY);

const response = await dg.listen.preRecorded({
  buffer: audioBuffer,
  mimeType: 'audio/wav'
}, {
  model: 'nova-2',
  language: 'en',
  punctuate: true
});

const transcript = response.result.results.channels[0].alternatives[0].transcript
```

**Current Implementation**: Receives voice from Telegram → Deepgram → LLM → Text reply

---

### ElevenLabs (Text-to-Speech)

**Purpose**: Convert text to voice responses  
**Status**: ⏳ Ready to integrate (SDK in package.json, not used)

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` |
| **Authentication** | API key (header) |
| **Env Var** | `ELEVENLABS_API_KEY`, `ELEVENLABS_VOICE_ID` |
| **Voices** | 32+ professional voices |
| **Audio Format** | MP3, PCM (configurable) |
| **Rate Limit** | ~100 requests/minute (starter) |
| **Cost** | ~$0.003/1000 characters (pay-as-you-go) |
| **Status** | 📋 Phase 2: Integrate for voice replies |

**Example Integration** (not yet live):
```javascript
const { TextToSpeechClient } = require('@elevenlabs/client');

const client = new TextToSpeechClient({
  apiKey: process.env.ELEVENLABS_API_KEY
});

const audio = await client.convert({
  text: 'Your landing page is live!',
  voice_id: process.env.ELEVENLABS_VOICE_ID,
  model_id: 'eleven_monolingual_v1'
});

await bot.sendAudio(chatId, audio)
```

---

## III. Image & Media Generation

### Replicate (Image Generation)

**Purpose**: Generate product photos, social graphics  
**Status**: ⏳ Ready to integrate (not yet used)

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://api.replicate.com/v1/predictions` |
| **Authentication** | API token (header) |
| **Env Var** | `REPLICATE_API_TOKEN` |
| **Models** | Stable Diffusion 3.5, Flux, DALL-E 3 (via Replicate) |
| **Rate Limit** | Varies; ~10 concurrent predictions |
| **Cost** | ~$0.02–0.10 per image (varies by model/size) |
| **Status** | 📋 Phase 2: Image factory integration |

**Example**:
```javascript
const Replicate = require('replicate');
const replicate = new Replicate({
  auth: process.env.REPLICATE_API_TOKEN
});

const output = await replicate.run(
  'stability-ai/stable-diffusion-3.5-medium',
  {
    input: {
      prompt: 'A professional product photo of a fitness app',
      negative_prompt: 'blurry, low quality',
      num_outputs: 1,
      width: 1024,
      height: 1024
    }
  }
);
// output[0] = image URL
```

---

### Midjourney (Premium Image Generation)

**Purpose**: High-quality image generation (premium alternative)  
**Status**: ⏳ Not integrated; requires webhook

| Property | Value |
|----------|-------|
| **API Endpoint** | Webhook-based (no direct REST API) |
| **Authentication** | API key for webhook verification |
| **Env Var** | `MIDJOURNEY_API_KEY` |
| **Quality** | Highest (artistic, professional) |
| **Cost** | ~$0.40 per image (higher than Replicate) |
| **Status** | 📋 Phase 2: Optional premium tier |

**Note**: Midjourney operates via webhooks; users create Discord interactions, we poll for status.

---

## IV. Data Enrichment & Validation

### Clearbit (Email Validation & B2B Enrichment)

**Purpose**: Validate emails, enrich leads with company data  
**Status**: ✅ Integrated in Lead Gen Factory, currently optional

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://api.clearbit.com/v1/...` |
| **Authentication** | Bearer token (API key) |
| **Env Var** | `CLEARBIT_API_KEY` |
| **Rate Limit** | 100 calls/sec (high tier) |
| **Cost** | ~$0.10–0.20 per lookup (varies by data type) |
| **Endpoints** | Enrichment, Email Finder, Domain Search |
| **Status** | ✅ Ready; used in lead gen |

**Usage** (in Lead Gen Factory):
```javascript
const response = await fetch('https://api.clearbit.com/v1/people/find', {
  headers: { Authorization: `Bearer ${clearbitKey}` },
  body: JSON.stringify({ email: 'user@company.com' })
});
// Returns: name, title, company, social, seniority, etc.
```

---

### Apollo.io (B2B Lead Database)

**Purpose**: Alternative lead source / enrichment  
**Status**: ⏳ Not yet integrated

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://api.apollo.io/v1/...` |
| **Authentication** | API key |
| **Env Var** | `APOLLO_API_KEY` (future) |
| **Rate Limit** | Varies by plan |
| **Cost** | Pay-per-lead ($0.05–0.25 per lead) |
| **Status** | 📋 Phase 2: Alternative to Clearbit |

---

## V. Email & Marketing

### Brevo (Email Marketing, formerly Sendinblue)

**Purpose**: Send emails, manage email lists, track opens/clicks  
**Status**: ✅ Integrated in Landing Page Factory

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://api.brevo.com/v3/` |
| **Authentication** | API key (header: `api-key`) |
| **Env Var** | `BREVO_API_KEY` |
| **Rate Limit** | 300 requests/minute |
| **Cost** | Free tier (300/day); paid ($20+/month for 1M emails/month) |
| **Features** | Contacts, lists, campaigns, automation, templates |
| **Status** | ✅ Live in landing page flow |

**Usage**:
```javascript
const brevo = require('@getbrevo/brevo');

const api = new brevo.ContactsApi();
api.setApiKey('api-key', process.env.BREVO_API_KEY);

await api.createContact({
  email: 'user@example.com',
  firstName: 'John',
  listIds: [1]  // Add to list 1
});

// Send campaign
const campaign = new brevo.CreateEmailCampaign({
  name: 'Welcome sequence',
  subject: 'Welcome to {{NAME}}!',
  recipients: { listIds: [1] },
  sender: { name: 'HustleBot', email: 'noreply@hustlebot.io' }
});
```

---

## VI. Payments

### Stripe (Payment Processing)

**Purpose**: Accept payments, manage subscriptions  
**Status**: ✅ Integrated in Landing Page Factory

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://api.stripe.com/v1/...` |
| **Authentication** | Secret key (server-side) |
| **Env Var** | `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET` |
| **Rate Limit** | 100 requests/second |
| **Cost** | 2.9% + $0.30 per transaction (standard) |
| **Features** | Payment intents, subscriptions, webhooks, invoices |
| **Status** | ✅ Ready for payment processing |

**Usage**:
```javascript
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const paymentIntent = await stripe.paymentIntents.create({
  amount: 5000,  // $50.00
  currency: 'usd',
  metadata: { product: 'landing_page' }
});
```

---

## VII. Web & Content

### Firecrawl (Web Scraping)

**Purpose**: Extract structured data from websites  
**Status**: ✅ Available (used in lead gen)

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://api.firecrawl.dev/v1/...` |
| **Authentication** | API key |
| **Env Var** | `FIRECRAWL_API_KEY` |
| **Rate Limit** | ~5 concurrent; 100/minute |
| **Cost** | ~$0.002 per page |
| **Status** | ✅ Integrated in lead gen; can scrape any site |

---

### Playwright (Web Scraping Alternative)

**Purpose**: Browser automation, screenshot capture, deep scraping  
**Status**: ✅ In package.json, used in lead gen for fallback

| Property | Value |
|----------|-------|
| **Package** | `playwright@^1.40.0` |
| **Cost** | Free (open-source) |
| **Browsers** | Chromium, Firefox, WebKit |
| **Usage** | Navigate, screenshot, extract DOM, PDF generation |
| **Status** | ✅ Local execution; no API key needed |

---

## VIII. Messaging

### Telegram Bot API

**Purpose**: User messaging gateway  
**Integration**: `src/server.js`, Telegraf library

| Property | Value |
|----------|-------|
| **Bot Token** | From @BotFather in Telegram |
| **Env Var** | `TELEGRAM_BOT_TOKEN` |
| **Webhook URL** | `POST /api/telegram/webhook` (your server) |
| **Rate Limit** | 30 messages/second per chat |
| **Auth** | Bot token in URL or header |
| **Status** | ✅ Live, full integration |

**Setup**:
```bash
# 1. Talk to @BotFather in Telegram
/newbot
# → Get token: 123456789:ABCdefGHIjklmnoPQRstuvWXYZabcdefg

# 2. Set webhook
curl https://api.telegram.org/bot{TOKEN}/setWebhook \
  -F url="https://your-domain.com/api/telegram/webhook"

# 3. Add to .env
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklmnoPQRstuvWXYZabcdefg
```

---

## IX. Infrastructure & Deployment

### Vercel (Frontend Hosting)

**Purpose**: Deploy React landing pages, dashboards  
**Status**: ✅ Integrated in landing page factory

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://api.vercel.com/v*` |
| **Authentication** | Access token |
| **Env Var** | `VERCEL_TOKEN`, `VERCEL_TEAM_ID` |
| **Rate Limit** | Varies by tier |
| **Cost** | Free tier (up to 100 deployments/month); Pro $20/month |
| **Status** | ✅ Landing page factory deploys live |

---

### Render (Backend Hosting)

**Purpose**: Deploy HustleBot server  
**Status**: ⏳ Available; not used (running locally or via Vercel)

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://api.render.com/v1/` |
| **Authentication** | API key |
| **Env Var** | `RENDER_API_KEY` |
| **Pricing** | Free tier (500 hours/month); Starter $7/month |
| **Status** | 📋 Phase 2: Production deployment target |

---

## X. Cloud Storage

### AWS S3 (Object Storage)

**Purpose**: Store generated files (images, PDFs, exports)  
**Status**: ✅ In package.json; optional integration

| Property | Value |
|----------|-------|
| **API Endpoint** | `https://s3.amazonaws.com` or regional |
| **Authentication** | AWS access key + secret key |
| **Env Var** | `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET` |
| **Region** | `AWS_REGION` (default: us-east-1) |
| **Cost** | ~$0.023 per GB stored; $0.0004 per GET request |
| **Status** | ✅ Ready; not yet used |

**Usage**:
```javascript
const AWS = require('aws-sdk');
const s3 = new AWS.S3({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
});

await s3.putObject({
  Bucket: process.env.AWS_S3_BUCKET,
  Key: 'landing-pages/page-123.html',
  Body: htmlContent,
  ContentType: 'text/html'
}).promise();
```

---

### Supabase Storage

**Purpose**: Alternative to S3; built into Supabase  
**Status**: ✅ Available via Supabase SDK

---

## XI. Redis (Caching & Queue)

### Redis Server

**Purpose**: Job queue (Phase 1), caching, sessions  
**Status**: ⏳ Bull.js in package.json; Redis backend not yet configured

| Property | Value |
|----------|-------|
| **Connection** | `redis://localhost:6379` (local) or managed Redis |
| **Env Var** | `REDIS_URL` |
| **Cost** | Free (self-hosted) or $15+/month (managed) |
| **Use Case** | Bull job queue (Phase 1) + caching |
| **Status** | 📋 Phase 1: Set up Redis for job persistence |

**Phase 1 Integration**:
```javascript
const Queue = require('bull');
const jobQueue = new Queue('agent_tasks', process.env.REDIS_URL);

await jobQueue.add(
  { agentName: 'copywriter', input: '...' },
  { attempts: 3, backoff: 'exponential' }
);
```

---

## XII. Credentials Summary

### Required for MVP (Production)

| Credential | Source | Status | Priority |
|------------|--------|--------|----------|
| `OPENROUTER_API_KEY` | openrouter.ai | ✅ Required | 🔴 Critical |
| `TELEGRAM_BOT_TOKEN` | @BotFather | ✅ Required | 🔴 Critical |
| `SUPABASE_URL` | supabase.com | ✅ Required | 🔴 Critical |
| `SUPABASE_KEY` | supabase.com | ✅ Required | 🔴 Critical |

### Optional (Phase 1+)

| Credential | Source | Status | Use Case |
|------------|--------|--------|----------|
| `DEEPGRAM_API_KEY` | deepgram.com | Optional | Voice input |
| `CLEARBIT_API_KEY` | clearbit.com | Optional | Lead enrichment |
| `BREVO_API_KEY` | brevo.com | Optional | Email marketing |
| `STRIPE_SECRET_KEY` | stripe.com | Optional | Payments |
| `AWS_*` | aws.amazon.com | Optional | Storage |
| `REPLICATE_API_TOKEN` | replicate.com | Optional | Image gen (Phase 2) |
| `ELEVENLABS_API_KEY` | elevenlabs.io | Optional | Text-to-speech (Phase 2) |

---

**Next**: See ENVIRONMENT.md for deployment config, DATA_MODEL.md for database schema.
