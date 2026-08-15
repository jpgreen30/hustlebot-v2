# Content Factory - Google Services Integration Guide

## Overview

The Content Factory integrates with Google services via **SerpAPI** to enhance content strategy and performance tracking. SerpAPI provides unified access to Google Trends, Search, and News data with automatic fallback to placeholder data when unavailable.

**Status:** ✅ **SerpAPI integration is live** - Configure `SERPAPI_API_KEY` for real Google data
**Fallback:** Placeholder data available out-of-box for MVP development

## Primary Integration: SerpAPI

**Purpose:** Unified access to Google data across Trends, Search, and News

**Setup:**
```env
SERPAPI_API_KEY=your_serpapi_api_key
```

**Features:**
- Real-time Google Trends analysis (search volume, trend direction, related queries)
- SERP competition analysis (top domains, snippet quality, result count)
- Google News aggregation for current events
- Automatic timeout handling (30 seconds per request)
- Graceful fallback to placeholder data

**Usage in Content Factory:**
The `ContentIntegrations` class automatically uses SerpAPI when `SERPAPI_API_KEY` is configured:

```javascript
// researchTrends() automatically calls SerpAPI.getTrends()
const trends = await this.integrations.researchTrends(topic);

// Returns:
{
  topic,
  timestamp,
  sources: {
    serpapi: { searchVolume, trend, keywords, relatedQueries },
    keywords: [...],
    searchInsights: { searchVolume, trend, competitionLevel },
    relatedTopics: [...]
  }
}
```

**SerpAPI Response Examples:**

Trends data includes:
- `searchVolume`: Estimated monthly search volume (e.g., 25000)
- `trend`: 'rising' | 'falling' | 'stable'
- `keywords`: Related search queries
- `relatedQueries`: Google Trends related queries

Search results include:
- `competitionLevel`: 'low' | 'medium' | 'high' based on snippet quality
- `topDomains`: Top-ranking domains with appearance counts
- `searchTime`: Google search execution time
- `totalResults`: Total results available

---

## Additional Integration Points

### 1. Google Trends (via SerpAPI)

**Purpose:** Discover trending topics and keywords to inform content strategy.

**Benefits:**
- Identify rising search topics in real-time
- Understand seasonal patterns
- Spot emerging opportunities in your niche
- Get search volume estimates and trend direction

**Implementation Status:** ✅ **Live via SerpAPI**

**How it works:**
When you call `researchTrends(topic)`, the Content Factory:
1. Checks if `SERPAPI_API_KEY` is configured
2. Calls `SerpAPI.getTrends()` for real Google Trends data
3. Extracts search volume, trend direction, and related queries
4. Falls back to placeholder data if SerpAPI is unavailable or times out

**Example output:**
```json
{
  "topic": "pregnancy nutrition",
  "searchVolume": 25000,
  "trend": "rising",
  "keywords": ["pregnancy nutrition", "pregnancy diet", "prenatal vitamins", ...],
  "relatedQueries": ["healthy pregnancy foods", "pregnancy meal plan", ...],
  "source": "serpapi_trends"
}
```

---

### 2. Google Search (SERP Analysis via SerpAPI)

**Purpose:** Analyze search results, competition, and ranking opportunities.

**Benefits:**
- Identify competitor domains and their ranking positions
- Analyze SERP competition levels based on snippet quality
- Find keyword ranking opportunities
- Monitor top-ranking content in your niche

**Implementation Status:** ✅ **Live via SerpAPI**

**How it works:**
When conducting research, SerpAPI provides:
- Top 20 organic search results
- Competition level analysis (based on snippet length and count)
- Top-ranking domains extracted from results
- Search time and total results count

**Example usage:**
```javascript
const serpData = await serpapi.getSearchResults('pregnancy nutrition');
// Returns:
{
  topic: 'pregnancy nutrition',
  totalResults: 45000000,
  competitionLevel: 'high',
  results: [
    {
      position: 1,
      title: 'Nutrition During Pregnancy',
      url: 'https://example.com/pregnancy-nutrition',
      domain: 'example.com',
      snippet: '...'
    },
    // ... more results
  ],
  topDomains: [
    { domain: 'example.com', appearances: 3 },
    { domain: 'health.org', appearances: 2 }
  ]
}
```

**Google Search Console Integration (Future):**
For own-site ranking data, optional integration with Google Search Console API:

```env
GOOGLE_SEARCH_CONSOLE_KEY=your_key_here
```

This would enhance `opportunityScoring()` with:
- Current ranking positions
- Click-through rates
- Search impressions by query
- Device breakdown

---

### 3. Google Analytics 4 (GA4)

**Purpose:** Understand user behavior and content performance metrics.

**Benefits:**
- Track content engagement (scroll depth, time on page)
- Identify top-performing content by topic
- Understand user intent and paths
- Measure conversion rates

**Setup:**
```env
GA4_API_KEY=your_key_here
GA4_PROPERTY_ID=your_property_id
```

**Implementation Status:** Ready to integrate via Google Analytics Data API v1.

**Key Metrics to Extract:**
- Page views and unique users
- Engagement rate
- Bounce rate
- Conversion tracking
- Goal completions

**Usage in Content Factory:**

#### Enhance `conductResearch()`:
```javascript
async conductResearch(topic, options = {}) {
  const gaData = await getGA4Data({
    query: topic,
    dimension: 'pagePath',
    metrics: ['engagementRate', 'scrollDepth', 'conversions']
  });

  return {
    sourceCount: gaData.length,
    sources: gaData,
    topPerformingContent: gaData.sort((a, b) => b.engagementRate - a.engagementRate),
    conversions: gaData.reduce((sum, item) => sum + item.conversions, 0)
  };
}
```

#### Enhance `performQA()`:
```javascript
// Use GA data to validate content quality
const gaMetrics = await getPageMetrics(contentUrl);
return {
  qualityScore: calculateFromGA(gaMetrics),
  factAccuracy: gaMetrics.bounceRate < 30 ? 0.9 : 0.7,
  readability: gaMetrics.scrollDepth > 0.5 ? 0.9 : 0.6,
  issues: identifyIssues(gaMetrics)
};
```

---

## Implementation Roadmap

### Phase 1: MVP (Current)
- ✅ Placeholder data for trends
- ✅ Error handling with fallbacks
- ⚠️ Google services marked but not connected

### Phase 2: Production Ready
- Google Trends API integration
- Google Search Console data fetching
- GA4 custom report building
- Caching layer for API responses

### Phase 3: Advanced
- Predictive analytics using GA4 + Trends
- Competitive analysis via GSC data
- Automated opportunity scoring
- Performance feedback loop

---

## API Integration Instructions

### SerpAPI (Primary - Recommended)

SerpAPI provides unified access to Google Trends, Search, and News without managing individual Google Cloud projects.

**Setup Steps:**
1. Visit https://serpapi.com
2. Sign up for free account (includes 100 free searches/month)
3. Get your API key from dashboard
4. Add to `.env`:
   ```env
   SERPAPI_API_KEY=your_serpapi_key
   ```
5. Test it:
   ```bash
   curl "https://serpapi.com/search?api_key=YOUR_KEY&engine=google_trends&q=pregnancy+nutrition"
   ```

**Pricing:**
- Free tier: 100 searches/month
- Paid: $10/month for 10,000 searches/month
- Pay-as-you-go for higher volumes

**Why SerpAPI:**
✅ No Google Cloud project needed  
✅ Unified API for Trends + Search + News  
✅ Instant setup, no OAuth complexity  
✅ Automatic fallback in Content Factory  
✅ Great for MVP and production  

---

### Google Trends (Direct Integration - Alternative)

If you prefer direct Google integration instead of SerpAPI:

1. Create a Google Cloud project
2. Enable Google Trends API (Note: No official API - use third-party libraries)
3. Alternatives:
   - PyTrends (Python, unofficial)
   - trends-client npm package
   - Manual integration via Semrush API

### Google Search Console

1. Create a Google Cloud project
2. Enable Search Console API
3. Create OAuth 2.0 service account
4. Get property verification

```javascript
import { google } from 'googleapis';

const auth = new google.auth.GoogleAuth({
  keyFile: 'gsc-credentials.json',
  scopes: ['https://www.googleapis.com/auth/webmasters']
});

const webmasters = google.webmasters({ version: 'v3', auth });

// Fetch top queries for a topic
const data = await webmasters.searchanalytics.query({
  siteUrl: 'https://hustlebot.io',
  requestBody: {
    startDate: '2026-01-01',
    endDate: '2026-08-15',
    dimensions: ['query'],
    rowLimit: 10,
    filters: [{
      dimension: 'query',
      operator: 'contains',
      expression: topic
    }]
  }
});
```

### Google Analytics 4

1. Set up Google Analytics 4 property
2. Create Google Cloud project
3. Enable Google Analytics Data API
4. Create OAuth 2.0 service account

```javascript
import { BetaAnalyticsDataClient } from '@google-analytics/data';

const client = new BetaAnalyticsDataClient({ keyFilename: 'ga4-credentials.json' });

const response = await client.runReport({
  property: 'properties/YOUR_PROPERTY_ID',
  dateRanges: [{
    startDate: '30daysAgo',
    endDate: 'today'
  }],
  dimensions: [{ name: 'pageTitle' }],
  metrics: [
    { name: 'engagementRate' },
    { name: 'scrollDepth' },
    { name: 'eventCount' }
  ],
  dimensionFilter: {
    filter: {
      fieldName: 'pageTitle',
      stringFilter: { matchType: 'CONTAINS', value: topic }
    }
  }
});
```

---

## Environment Variables

### Primary Integration (Recommended)

```env
# SERPAPI - Unified Google data (Trends, Search, News)
# Get free key at https://serpapi.com
SERPAPI_API_KEY=your_serpapi_key_here
```

This single key enables:
- ✅ Google Trends data (search volume, trend direction, related queries)
- ✅ Google Search results (SERP analysis, competition, top domains)
- ✅ Google News (current events in your niche)

### Optional: Google Services (Direct Integration)

If you prefer direct Google APIs instead of SerpAPI:

```env
# Google Trends (Optional - requires third-party solution)
GOOGLE_TRENDS_API_KEY=your_key_here

# Google Search Console (Optional - for own-site ranking data)
GOOGLE_SEARCH_CONSOLE_KEY=your_key_here
GOOGLE_SEARCH_CONSOLE_PROPERTY=https://your-domain.com

# Google Analytics 4 (Optional - for engagement metrics)
GA4_API_KEY=your_key_here
GA4_PROPERTY_ID=123456789

# Service Account Credentials (for OAuth flows)
GOOGLE_SERVICE_ACCOUNT_JSON=path/to/credentials.json
```

### Content Factory Configuration

```env
# Domain context for content generation
CONTENT_DOMAIN=parenting and family wellness

# Async job processing
MAX_CONCURRENT_JOBS=3

# API timeouts (milliseconds)
CONTENT_CALL_TIMEOUT=30000
```

---

## Testing Google Integration

### Test 1: Without API Keys (Placeholder Data)
Content Factory works out-of-box with placeholder data:

```bash
curl -X POST http://localhost:3000/api/content/generate \
  -H "Content-Type: application/json" \
  -d '{"topic": "pregnancy nutrition", "contentType": "guide"}'
```

**Response:** Success with placeholder trends, search data, and generated content

### Test 2: With SerpAPI (Real Google Data)

1. Get free SerpAPI key at https://serpapi.com
2. Add to `.env`:
   ```env
   SERPAPI_API_KEY=your_key
   ```
3. Restart server
4. Test trends endpoint:
   ```bash
   curl -X POST http://localhost:3000/api/content/generate-async \
     -H "Content-Type: application/json" \
     -d '{"topic": "pregnancy nutrition", "contentType": "guide"}'
   ```
5. Check job status:
   ```bash
   curl http://localhost:3000/api/content/job/JOBID
   ```

### Test 3: Monitor SerpAPI Usage

The server logs will show:
- `📊 Researching trends for: pregnancy nutrition`
- `🔍 Fetching real Google Trends data from SerpAPI...` (if key configured)
- `searchVolume: 25000, trend: rising` (real data from Google)

Check SerpAPI dashboard to see API call counts and remaining quota.

### Test 4: Async Content Generation

For long-running content generation, use async endpoints:

**Start generation:**
```bash
curl -X POST http://localhost:3000/api/content/generate-async \
  -H "Content-Type: application/json" \
  -d '{
    "topic": "pregnancy nutrition",
    "contentType": "guide",
    "options": {}
  }'
```

**Response:**
```json
{
  "jobId": "job_xxx",
  "status": "queued",
  "message": "Content generation job started. Check status at /api/content/job/job_xxx"
}
```

**Check status:**
```bash
curl http://localhost:3000/api/content/job/job_xxx
```

**Queue statistics:**
```bash
curl http://localhost:3000/api/content/queue-stats
```

---

## Performance Considerations

### Caching Strategy
Google API calls should be cached to avoid quota limits:

```javascript
// Cache trends for 24 hours
const CACHE_TTL = 86400000;
const cache = new Map();

async function getCachedTrends(topic) {
  const cacheKey = `trends:${topic}`;
  if (cache.has(cacheKey)) {
    const { data, timestamp } = cache.get(cacheKey);
    if (Date.now() - timestamp < CACHE_TTL) {
      return data;
    }
  }
  
  const data = await realGoogleTrendsCall(topic);
  cache.set(cacheKey, { data, timestamp: Date.now() });
  return data;
}
```

### Rate Limiting
- Google Trends: ~1,000 queries/day free tier
- Google Search Console: 500 queries/day
- Google Analytics 4: 500,000 hits/month free tier

---

## Troubleshooting

### "OPENROUTER_API_KEY not configured"
- Image generation falls back to placeholder
- Set `OPENROUTER_API_KEY` to enable real images

### "LLM provider not configured"
- Content generation uses mock data
- Set `OPENROUTER_API_KEY` to enable real LLM

### "SerpAPI timeout" or "SerpAPI error"
- SerpAPI fell back to placeholder data
- Check `SERPAPI_API_KEY` is valid at https://serpapi.com
- Verify SerpAPI account has remaining quota
- Content Factory continues to work with placeholder data

### "OPENROUTER_API_KEY not configured"
- Image generation falls back to placeholder
- Set `OPENROUTER_API_KEY` to enable real images

### "LLM provider not configured"
- Content generation uses mock data
- Set `OPENROUTER_API_KEY` to enable real LLM

---

## FAQ

**Q: Do I need Google services to use Content Factory?**  
A: No. The MVP works with placeholders. SerpAPI enhances strategy but is optional. Content Factory has graceful fallback to placeholder data when SerpAPI is unavailable.

**Q: SerpAPI vs. Direct Google Integration - which is better?**  
A: **SerpAPI is recommended for most users:**
- ✅ Single API key for Trends + Search + News
- ✅ No Google Cloud project setup needed
- ✅ Instant setup, no OAuth complexity
- ✅ $0-$10/month depending on volume
- ✅ Content Factory already integrated

**Direct Google APIs** are better if:
- You already have Google Cloud projects set up
- You need own-site ranking data (Google Search Console)
- You need detailed engagement metrics (Google Analytics 4)
- You have enterprise volume and prefer direct billing

**Q: What's the recommended setup order?**  
A: 1. Get SerpAPI key (5 minutes at https://serpapi.com)  
2. Add to `.env` and restart  
3. (Optional) Add Google Search Console for your own site  
4. (Optional) Add GA4 for engagement tracking

**Q: Can I use Semrush instead?**  
A: Yes! Set `SEMRUSH_API_KEY` for competitive analysis and keyword data. Semrush has more detailed competitor data but requires a paid subscription ($99+/month).

**Q: How often should I sync Google data?**  
A: SerpAPI quotas are per-request:
- Free tier: 100 searches/month
- Paid tier: 10,000 searches/month
- The Content Factory caches results per job to minimize API calls
- Each content generation job typically makes 2-3 API calls (Trends + Search + News)

**Q: What if SerpAPI quota is exceeded?**  
A: Content Factory automatically falls back to placeholder data and logs a warning. Your content pipeline continues to work - you just get estimated data instead of real Google data. Upgrade to a paid SerpAPI plan when needed.

---

## Resources

- [Google Search Console API](https://developers.google.com/webmaster-tools)
- [Google Analytics Data API](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [Google Trends (Unofficial)](https://github.com/pat310/google-trends-api)
- [Semrush API](https://developer.semrush.com/)
