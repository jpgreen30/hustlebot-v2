# HustleBot v2 - Environment & Deployment

**Version**: 0.1 (Phase 0, 2026-08-14)

---

## I. Local Development

### Setup

**1. Clone & Install**
```bash
git clone https://github.com/jpgreen30/hustlebot-v2.git
cd hustlebot-v2
npm install
```

**2. Environment Variables**
```bash
cp .env.example .env
nano .env  # Or use your editor
```

**3. Required for MVP**
```
OPENROUTER_API_KEY=sk-or-v1-xxxxx
TELEGRAM_BOT_TOKEN=123456789:ABCdef...
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGc...
```

**4. Required for Database Migration**
```bash
# BEFORE running npm run db:migrate, also set:
SUPABASE_SERVICE_KEY=eyJhbGc...  # Service role key (NOT anon key)
```

To get the service role key:
- Supabase Dashboard → Settings → API → Service Role Secret key
- Copy and add to `.env`

**5. Database Migration**
```bash
npm run db:migrate
```

**5. Start Server**
```bash
npm run dev        # Watch mode (with nodemon)
# OR
npm start          # Production mode
```

**Expected Output**:
```
🚀 Initializing HustleBot v2...
🌐 Setting up Express server...
✅ Express server ready
📦 Connecting to Supabase...
✅ Supabase connected  (or ⚠️ graceful fail)
🧠 Initializing OpenRouter...
✅ OpenRouter ready
🎤 Initializing Deepgram voice...
✅ Deepgram voice ready  (or optional skip)
📱 Initializing Telegram bot...
✅ Telegram bot ready
🎉 HustleBot v2 initialized successfully!
🎧 Listening on http://localhost:3000
```

### Verification

```bash
# Health check
curl http://localhost:3000/health
# → { status: 'ok', timestamp: '...', service: 'hustlebot-v2' }

# Status check
curl http://localhost:3000/api/status
# → { status: 'running', database: 'connected', llm: 'ready', ... }
```

---

## II. Environment Variables Reference

### Server Config

```
# Mode
NODE_ENV=development          # development | production

# Port
PORT=3000                     # HTTP listen port

# Logging
LOG_LEVEL=info               # debug | info | warn | error
```

### LLM (OpenRouter)

```
OPENROUTER_API_KEY=sk-or-v1-xxxxx
OPENROUTER_BASE_URL=https://openrouter.ai/api/v1
```

### Telegram Bot

```
TELEGRAM_BOT_TOKEN=123456789:ABCdefGHIjklmnoPQRstuvWXYZabcdefg
```

### Database (Supabase)

```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_KEY=eyJhbGc...  # anon key (for browser)
SUPABASE_SERVICE_KEY=...  # service role (for server, more powerful)
```

### Voice (Deepgram, optional)

```
DEEPGRAM_API_KEY=your_key
```

### Email (Brevo, optional)

```
BREVO_API_KEY=your_key
```

### Payments (Stripe, optional)

```
STRIPE_SECRET_KEY=sk_test_...
STRIPE_PUBLISHABLE_KEY=pk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```

### Image Generation (optional)

```
REPLICATE_API_TOKEN=your_token
MIDJOURNEY_API_KEY=your_key
```

### Cloud Storage (optional)

```
AWS_ACCESS_KEY_ID=AKIAIOSFODNN7EXAMPLE
AWS_SECRET_ACCESS_KEY=wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY
AWS_REGION=us-east-1
AWS_S3_BUCKET=hustlebot-assets
```

### Redis (Phase 1)

```
REDIS_URL=redis://localhost:6379
```

### Budget & Tracking

```
MONTHLY_BUDGET=100           # Hard cap in USD
BUDGET_CURRENCY=USD
TRACK_SPEND=true
```

### Feature Flags

```
ENABLE_VOICE_INPUT=true
ENABLE_IMAGE_GENERATION=true
ENABLE_LEAD_GENERATION=true
ENABLE_LANDING_PAGE_BUILDER=true
ENABLE_EMAIL_AUTOMATION=true
```

---

## III. Docker Deployment (Phase 1)

### Dockerfile

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src ./src
COPY scripts ./scripts

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
```

### Docker Compose (Local Development)

```yaml
version: '3.8'

services:
  hustlebot:
    build: .
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: development
      OPENROUTER_API_KEY: ${OPENROUTER_API_KEY}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN}
      SUPABASE_URL: ${SUPABASE_URL}
      SUPABASE_KEY: ${SUPABASE_KEY}
    volumes:
      - .:/app
      - /app/node_modules
    command: npm run dev

  redis:
    image: redis:7-alpine
    ports:
      - "6379:6379"

  # Supabase (optional - use hosted instead)
  # supabase:
  #   ...
```

**Start**:
```bash
docker-compose up
# Access: http://localhost:3000
```

---

## IV. Deployment: Render

### Setup via Render Dashboard

**1. Connect GitHub**
- Log in to render.com
- Connect `jpgreen30/hustlebot-v2`

**2. Create Web Service**
- Blueprint: Node
- Build Command: `npm install`
- Start Command: `node src/server.js`
- Region: Oregon (or your choice)

**3. Environment Variables**
Set all required vars in Render dashboard:
```
OPENROUTER_API_KEY=...
TELEGRAM_BOT_TOKEN=...
SUPABASE_URL=...
SUPABASE_KEY=...
NODE_ENV=production
```

**4. Deploy**
```bash
# Auto-deploys on push to main; or trigger manually
git push origin main
```

**5. Set Telegram Webhook**
```bash
curl https://api.telegram.org/bot{TOKEN}/setWebhook \
  -F url="https://hustlebot-v2.onrender.com/api/telegram/webhook"
```

---

## V. Deployment: Vercel (Frontend)

**Landing Pages** built by Landing Page Factory deploy to Vercel.

### Credentials

```
VERCEL_TOKEN=...       # Access token from vercel.com/account/tokens
VERCEL_TEAM_ID=...     # Team ID (if using team workspace)
```

### API Usage

```javascript
// In Landing Page Factory
const vercel = new VercelClient(process.env.VERCEL_TOKEN);

await vercel.deployProject({
  name: 'landing-page-123',
  code: htmlCode,
  projectId: 'proj_xxx'  // Or create new each time
});
```

---

## VI. Deployment: AWS Lambda (Phase 2)

Not yet configured, but feasible:

```javascript
// Handler wrapper
import { handler } from './src/server.js';

export const lambdaHandler = async (event, context) => {
  return handler(event, context);
};
```

**Benefits**:
- Serverless (no server to manage)
- Pay per invocation
- Auto-scaling

**Tradeoffs**:
- Cold starts (~500ms)
- Telegram webhook timeout (30s limit; may need SQS)

---

## VII. Database Migrations

### Running Migrations

```bash
# Run all pending migrations
npm run db:migrate

# Check status
npm run db:migrate -- --status
```

### Migration Files Location

```
scripts/migrate.js
```

### Manual Migration (if needed)

```bash
# Connect to Supabase
psql postgresql://user:pass@host/db

# Run SQL
\i scripts/schema.sql
```

---

## VIII. Logging & Monitoring

### Local Logging

Winston logs to **console** in development:

```
ℹ️  info: 🚀 Initializing HustleBot v2...
ℹ️  info: 🌐 Setting up Express server...
✅ info: ✅ Express server ready
...
```

### Production Logging

**Phase 1**: Configure log aggregation:
- Send Winston logs → CloudWatch / Datadog / LogRocket
- Index by: timestamp, agent name, user ID, error severity

```javascript
// Future: Add transport
const cloudwatch = new WinstonCloudWatch({
  logGroupName: '/aws/lambda/hustlebot-v2',
  logStreamName: () => `stream-${Date.now()}`,
  awsRegion: 'us-east-1',
  messageFormatter: (log) => JSON.stringify(log)
});

logger.add(cloudwatch);
```

### Error Tracking

**Sentry Integration (Phase 1)**:
```bash
npm install @sentry/node
```

```javascript
import Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV
});

app.use(Sentry.Handlers.errorHandler());
```

---

## IX. Performance Tuning

### LLM Caching

**Phase 1**: Cache identical prompts:
```javascript
const cache = new Map();

async function complete(prompt, options) {
  const key = hash(`${prompt}:${JSON.stringify(options)}`);
  if (cache.has(key)) {
    return cache.get(key);  // Cache hit
  }
  
  const result = await llm.complete(prompt, options);
  cache.set(key, result);
  return result;
}
```

### Database Query Optimization

- Index on `user_id`, `project_id`, `timestamp` (audit table)
- Index on `status` (job state table)
- Connection pooling via Supabase (built-in)

### Rate Limiting

**Phase 1**: Use `express-rate-limit`:
```bash
npm install express-rate-limit
```

```javascript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 60 * 1000,  // 1 minute
  max: 10                // 10 requests/min per IP
});

app.use('/api/', limiter);
```

---

## X. Security Checklist

- [ ] `.env` file in `.gitignore` (never commit secrets)
- [ ] Use Render/Vercel environment variables (not `env.local`)
- [ ] Telegram webhook verified (Render HTTPS required)
- [ ] CORS configured (limit origins)
- [ ] Rate limiting enabled (prevent abuse)
- [ ] SQL injection prevention (use parameterized queries via Supabase SDK)
- [ ] API keys rotated regularly
- [ ] Sentry configured (error alerting)

---

## XI. Troubleshooting

### Issue: "OPENROUTER_API_KEY not set"

**Solution**: Check `.env` file
```bash
grep OPENROUTER_API_KEY .env
# If empty, update with your key from openrouter.ai
```

### Issue: Telegram bot not responding

**Symptoms**: Message sent, no reply

**Debugging**:
```bash
curl http://localhost:3000/api/debug
# Check: bot_initialized, bot_token_exists
```

**Fixes**:
1. Verify `TELEGRAM_BOT_TOKEN` in `.env`
2. Set webhook: `curl ... /setWebhook -F url="https://your-domain/api/telegram/webhook"`
3. Check Render logs: `render logs hustlebot-v2`

### Issue: Supabase connection timeout

**Solution**: Check connection string format
```
SUPABASE_URL=https://xxx.supabase.co  # NOT https://xxx.supabase.co/
SUPABASE_KEY=eyJhbGc...               # anon key (not service key)
```

---

## XII. Env-Specific Configs

### Development

```
NODE_ENV=development
LOG_LEVEL=debug
ENABLE_VOICE_INPUT=true
ENABLE_IMAGE_GENERATION=true
```

### Staging

```
NODE_ENV=production
LOG_LEVEL=info
ENABLE_VOICE_INPUT=true
ENABLE_IMAGE_GENERATION=false  # Save cost
```

### Production

```
NODE_ENV=production
LOG_LEVEL=warn
ENABLE_VOICE_INPUT=true
ENABLE_IMAGE_GENERATION=false  # Controlled by feature flag
MONTHLY_BUDGET=100
```

---

**Next**: See DATA_MODEL.md for database schema, or return to MASTER_SPEC.md for architectural decisions.
