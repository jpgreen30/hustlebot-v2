# Content Factory - Google Services Integration Guide

## Overview

The Content Factory can integrate with Google services to enhance content strategy and performance tracking. These integrations are **optional for MVP** but **highly recommended for production**.

## Integration Points

### 1. Google Trends API

**Purpose:** Discover trending topics and keywords to inform content strategy.

**Benefits:**
- Identify rising search topics in real-time
- Understand seasonal patterns
- Spot emerging opportunities in your niche

**Setup:**
```env
GOOGLE_TRENDS_API_KEY=your_key_here
```

**Implementation Status:** Currently uses placeholder trend data. Real integration pending.

**Usage in Content Factory:**
```javascript
// In researchTrends() method
if (this.googleTrendsEnabled) {
  const trends = await fetchGoogleTrends(topic);
  return { ...trends, sources: { keywords: trends.keywords } };
}
```

---

### 2. Google Search Console API

**Purpose:** Analyze which pages rank for which keywords and get click-through data.

**Benefits:**
- Identify search queries driving traffic
- Find low-hanging fruit (high position, low CTR)
- Monitor keyword rankings over time
- Detect issues with indexing

**Setup:**
```env
GOOGLE_SEARCH_CONSOLE_KEY=your_key_here
```

**Implementation Status:** Ready to integrate via MCP server tools available in this environment.

**Key Metrics to Track:**
- Search impressions by query
- Click-through rate (CTR)
- Average position
- Device breakdown

**Usage Example:**
```javascript
// Could enhance opportunityScoring()
const gscData = await getSearchConsoleData(topic);
const opportunity = {
  score: calculateScore(gscData),
  searchVolume: gscData.impressions,
  currentRanking: gscData.avgPosition,
  ctrPotential: 1 - gscData.ctr // Low CTR = high opportunity
};
```

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

### Google Trends

1. Create a Google Cloud project
2. Enable Google Trends API (Note: No official API - use third-party)
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

Add these to `.env` to enable Google services:

```env
# Google Trends (Optional)
GOOGLE_TRENDS_API_KEY=your_key_here

# Google Search Console (Optional)
GOOGLE_SEARCH_CONSOLE_KEY=your_key_here
GOOGLE_SEARCH_CONSOLE_PROPERTY=https://your-domain.com

# Google Analytics 4 (Optional)
GA4_API_KEY=your_key_here
GA4_PROPERTY_ID=123456789

# Service Account Credentials (for OAuth flows)
GOOGLE_SERVICE_ACCOUNT_JSON=path/to/credentials.json
```

---

## Testing Google Integration

### Test without API keys (Current MVP):
```bash
curl -X POST http://localhost:3000/api/content/generate \
  -H "Content-Type: application/json" \
  -d '{"topic": "pregnancy tips", "contentType": "guide"}'
```

Content Factory will use placeholder trend data and succeed.

### Enable Google Services:
1. Set environment variables with real API keys
2. Content Factory will automatically detect and use them
3. Monitor logs for "Fetching real ... data" messages

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

### "Google Trends API error"
- Check API key validity
- Verify quota not exceeded
- Falls back to placeholder trends

---

## FAQ

**Q: Do I need Google services to use Content Factory?**  
A: No. The MVP works with placeholders. Google services enhance strategy but are optional.

**Q: Which should I set up first?**  
A: 1. Google Search Console (highest value for keyword research)  
2. GA4 (track content performance)  
3. Google Trends (stay ahead of trends)

**Q: Can I use Semrush instead?**  
A: Yes! Set `SEMRUSH_API_KEY` for competitive analysis and keyword data.

**Q: How often should I sync Google data?**  
A: Google Search Console: Daily, GA4: Hourly, Trends: Weekly.

---

## Resources

- [Google Search Console API](https://developers.google.com/webmaster-tools)
- [Google Analytics Data API](https://developers.google.com/analytics/devguides/reporting/data/v1)
- [Google Trends (Unofficial)](https://github.com/pat310/google-trends-api)
- [Semrush API](https://developer.semrush.com/)
