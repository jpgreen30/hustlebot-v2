# Retell AI Outbound Calling

Make intelligent outbound calls with AI-generated scripts created through Claude + ChatGPT collaboration.

## Overview

**Three-step workflow:**

```
1. Script Generation (Claude ↔ ChatGPT collaboration)
   ↓
2. Script Optimization (feedback loop)
   ↓
3. Outbound Calls (Retell AI)
   ↓
4. Recording & Analysis (transcription, summaries)
```

## Setup

### 1. Get Retell API Credentials

1. Sign up at https://retellai.com
2. Create API key from dashboard
3. Create an agent (AI personality for calls)
4. Get agent ID

### 2. Set Environment Variables

Add to Render or `.env`:

```env
RETELL_API_KEY=your_retell_api_key
RETELL_AGENT_ID=your_agent_id
```

### 3. Verify Configuration

```bash
# Test locally
npm start
# Should show: ✅ Retell integration ready
```

## Usage

### Generate Script + Make Call

**Via Claude MCP:**

```
Claude: "Create a lead qualification script and call (555) 123-4567"

1. Claude requests script generation
2. Claude generates initial draft
3. Claude sends to ChatGPT via mailbox
4. ChatGPT provides refinement feedback
5. Claude incorporates improvements
6. Script sent to Retell
7. Outbound call initiated to (555) 123-4567
8. Call recorded and transcribed
```

**Via Direct API:**

```javascript
// In HustleBot backend
const scriptResult = await scriptFactory.generateAndCall({
  phoneNumber: '555-123-4567',
  name: 'John Smith',
  purpose: 'Lead qualification call',
  context: 'Following up on marketing campaign signup',
  tone: 'professional'
});

// Returns:
{
  callId: 'call_xyz123',
  script: '[AI]: Hi John, thanks for signing up...',
  phoneNumber: '555-123-4567',
  name: 'John Smith',
  purpose: 'Lead qualification call'
}
```

## Script Generation Workflow

### Step 1: Initial Draft (Claude)

Claude generates using LLM:
- Opening that builds rapport
- Main talking points
- Objection handling responses
- Natural call closure
- Conversation markers [AI]: and [Customer]:

### Step 2: Refinement (ChatGPT)

Claude sends via mailbox:
```
To: chatgpt
Subject: Refine script for: Lead qualification call

Please review and improve this script:
[script content]

Provide suggestions for:
1. Natural conversation flow
2. Objection handling effectiveness
3. Tone improvements
4. Closure strategy
```

ChatGPT responds with:
- Specific improvements
- Better objection responses
- More natural phrasing
- Engagement techniques

### Step 3: Finalization (Claude)

Claude incorporates feedback:
```
Claude: "Here's feedback from ChatGPT..."
[incorporates suggestions]
[finalizes script]
```

Final script sent to Retell.

## Making Calls

### Basic Outbound Call

```javascript
const call = await retell.makeOutboundCall({
  phoneNumber: '+1-555-123-4567',
  script: 'Hi, this is an AI assistant calling about...',
  name: 'John Smith',
  purpose: 'Lead qualification',
});

// Returns:
{
  callId: 'call_abc123',
  phoneNumber: '+1-555-123-4567',
  name: 'John Smith',
  purpose: 'Lead qualification',
  status: 'initiating',
  startTime: '2026-08-15T...'
}
```

### With Callback Updates

```javascript
const call = await retell.makeOutboundCall({
  phoneNumber: '+1-555-123-4567',
  script: scriptContent,
  name: 'John Smith',
  purpose: 'Lead qualification',
  onUpdate: (callInfo) => {
    console.log(`Call status: ${callInfo.status}`);
    if (callInfo.status === 'completed') {
      console.log(`Transcript: ${callInfo.transcript}`);
      console.log(`Duration: ${callInfo.duration}s`);
    }
  }
});
```

## Call Lifecycle

### Call Statuses

- `initiating` - Call being set up
- `ringing` - Phone ringing
- `in-progress` - Call active
- `completed` - Call successful
- `failed` - Call failed to connect
- `no_answer` - Phone not answered
- `cancelled` - Call manually stopped

### Real-time Monitoring

Retell polls every 5 seconds for:
- Call status
- Duration
- Transcript (partial during call, full after)
- Recording URL
- Summary

### Example Flow

```
0s: initiating → Call queued
2s: ringing → Phone is ringing
5s: in-progress → Customer answered
120s: in-progress → Still on call
145s: in-progress → [transcript building]
180s: completed → Call ended
185s: [full transcript available]
190s: [summary generated]
```

## Getting Results

### After Call Completes

```javascript
// Get full call results
const results = await retell.getCallResults('call_abc123');

// Returns:
{
  callId: 'call_abc123',
  phoneNumber: '+1-555-123-4567',
  name: 'John Smith',
  purpose: 'Lead qualification',
  status: 'completed',
  duration: 247, // seconds
  startTime: '2026-08-15T10:30:00Z',
  transcript: 'Full conversation transcript...',
  summary: 'Customer interested in product, wants pricing info',
  recording: 'https://retell.ai/recordings/...'
}
```

### List Recent Calls

```javascript
const calls = await retell.listCalls(10);

// Returns array of last 10 calls with status
[
  {
    callId: 'call_xyz123',
    name: 'John Smith',
    status: 'completed',
    duration: 247
  },
  // ...
]
```

### Call Analytics

```javascript
const analytics = await retell.getAnalytics('24h');

// Returns:
{
  totalCalls: 25,
  completedCalls: 22,
  failedCalls: 3,
  successRate: '88%',
  averageDuration: '243 seconds'
}
```

## Advanced: Batch Calling

### Generate Script Once, Call Multiple Numbers

```javascript
// Step 1: Generate script (Claude + ChatGPT collaboration)
const scriptData = await scriptFactory.generateScript({
  purpose: 'Lead follow-up campaign',
  context: 'Contacts from trade show who showed interest',
  tone: 'friendly'
});

// Step 2: Make multiple calls with same script
const phoneNumbers = [
  '+1-555-111-1111',
  '+1-555-222-2222',
  '+1-555-333-3333'
];

const callIds = [];
for (const phoneNumber of phoneNumbers) {
  const call = await retell.makeOutboundCall({
    phoneNumber,
    script: scriptData.script,
    name: 'Prospect',
    purpose: scriptData.purpose,
  });
  callIds.push(call.callId);
}

// Step 3: Monitor all calls
setInterval(async () => {
  for (const callId of callIds) {
    const results = await retell.getCallResults(callId);
    console.log(`${results.name}: ${results.status}`);
  }
}, 10000);
```

## Script Format

Scripts use markers for conversation flow:

```
[AI]: Hi John, I'm calling because you recently showed interest in our product. Is this a good time to chat?

[Customer]: Sure, I have a few minutes.

[AI]: Great! I wanted to show you how our solution helps companies like yours save time on [specific pain point]. Have you experienced challenges with [pain point]?

[Customer]: Objection: Yes, but we already have a solution in place.

[AI]: I understand! Many of our customers said the same thing initially. What we've found is that our solution is faster by 40% and costs half as much. Can I show you a quick comparison?

[Customer]: Sure, go ahead.

[AI]: Perfect! [pitch details]. Would you be interested in a quick 15-minute demo?

[Customer]: Maybe, let me think about it.

[AI]: Absolutely! I'll send you an email with more information and a calendar link. You can book a demo whenever works for you. Sound good?

[Customer]: Okay, thanks.

[AI]: Great, John! Thanks for your time. Talk soon!
```

**Markers:**
- `[AI]:` - What the AI says
- `[Customer]:` - What the customer typically responds
- `Objection:` - Common objection scenario

## Integration with Workflows

### Automated Campaign

```
Workflow: "Lead follow-up campaign"

1. Trigger: New leads added (via LeadFactory)
2. Action: Generate script via ScriptFactory
3. Action: Make outbound calls to all leads
4. Action: Log call results
5. Action: If interested: Send email with calendar link
6. Action: If not interested: Mark as cold lead
7. Action: Generate campaign report
```

## Monitoring & Metrics

### Key Metrics to Track

- **Success Rate** = Completed calls / Total calls
- **Average Duration** = Total call time / Number of calls
- **Conversion Rate** = Interested leads / Total calls
- **Cost Per Call** = Retell costs / Number of calls

### Dashboard View (via Telegram)

```
Claude via Telegram:
📊 Call Campaign Report

Campaign: Lead follow-up
Period: Last 24 hours

📞 Calls Made: 25
✅ Connected: 22 (88%)
❌ No Answer: 2
⏱️ Avg Duration: 243 seconds

📈 Results:
- Interested: 8 (36%)
- Not interested: 14 (64%)

💰 Cost: $12.50
💵 Cost per conversion: $1.56

Top objection: "Already have solution"
Best script line: "[opening line] worked 80%"
```

## Troubleshooting

### Call Not Initiating

1. Check `RETELL_API_KEY` is valid
2. Check `RETELL_AGENT_ID` is set
3. Verify phone number format: +1-555-123-4567
4. Check Retell dashboard for account status

### No Transcript/Recording

- Wait 30+ seconds after call completes
- Recording uploads in background
- Check Retell dashboard for uploads

### Script Quality Issues

1. **Script too long:** Retell limits to ~5 min
2. **Unnatural flow:** Have ChatGPT refine in feedback loop
3. **Objections not handled:** Ask ChatGPT for more edge cases

### API Rate Limiting

- Retell has rate limits (check dashboard)
- Spread batch calls over time
- Use call queue to distribute

## Cost Estimation

**Retell Pricing (typical):**
- Per call: $0.10-0.50 depending on model
- Per minute: $0.01-0.02
- 25 calls × 4 min average = ~$10-25/day

**Optimize costs:**
- Shorter scripts (fewer minutes)
- Higher-quality scripts (fewer callbacks)
- Better qualification (fewer cold calls)

## Next Steps

1. ✅ Set up Retell API key
2. ✅ Configure agent ID  
3. ✅ Test script generation locally
4. ✅ Make test call
5. ⏳ Deploy to production
6. ⏳ Set up batch calling workflows
7. ⏳ Create analytics dashboard

## API Reference

### ScriptFactory

```javascript
// Generate script with collaboration
const script = await scriptFactory.generateScript({
  purpose: 'Lead qualification',
  context: 'Follow-up from webinar',
  tone: 'professional',
  maxDuration: 300
});

// Generate and call in one operation
const result = await scriptFactory.generateAndCall({
  phoneNumber: '+1-555-123-4567',
  name: 'John Smith',
  purpose: 'Lead qualification',
  context: 'Webinar attendee',
  tone: 'professional'
});
```

### RetellIntegration

```javascript
// Make call
const call = await retell.makeOutboundCall(options);

// Get results
const results = await retell.getCallResults(callId);

// List calls
const calls = await retell.listCalls(limit);

// Analytics
const stats = await retell.getAnalytics('24h');

// Cancel call
await retell.cancelCall(callId);
```

---

**Status:** Retell AI integration ready for outbound campaigns.
