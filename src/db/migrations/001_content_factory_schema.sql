-- Content Factory Schema
-- Tracks content generation, publishing, and performance

-- Content items table
CREATE TABLE IF NOT EXISTS content (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  title TEXT NOT NULL,
  slug TEXT NOT NULL,
  content_type VARCHAR(50) NOT NULL, -- guide, review, comparison, news, weekly_journey
  body TEXT,
  summary TEXT,
  featured_image_url TEXT,
  featured_image_alt TEXT,
  word_count INTEGER,
  reading_time_minutes INTEGER,
  status VARCHAR(50) DEFAULT 'draft', -- draft, published, archived
  author TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  published_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID,
  updated_by UUID,
  UNIQUE(project_id, slug)
);

-- Content metadata and SEO
CREATE TABLE IF NOT EXISTS content_seo (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  primary_keyword TEXT,
  secondary_keywords TEXT[], -- array of keywords
  meta_title TEXT,
  meta_description TEXT,
  heading_structure TEXT,
  canonical_url TEXT,
  readability_score DECIMAL(5,2),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Content pipeline stages and their outputs
CREATE TABLE IF NOT EXISTS content_pipeline (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  stage_name VARCHAR(100) NOT NULL, -- trends, opportunity, research, outline, generation, qa, seo, image, linking, publish, distribute
  stage_data JSONB, -- stage-specific output
  quality_score DECIMAL(5,2),
  duration_seconds INTEGER,
  status VARCHAR(50), -- pending, completed, failed
  error_message TEXT,
  started_at TIMESTAMP,
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Content research sources
CREATE TABLE IF NOT EXISTS content_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  url TEXT,
  title TEXT,
  relevance_score DECIMAL(3,2), -- 0-1
  source_type VARCHAR(50), -- article, research, competitor, discussion, product_feed
  accessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Content sections (for structured content)
CREATE TABLE IF NOT EXISTS content_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  section_order INTEGER,
  heading TEXT,
  content TEXT,
  word_count INTEGER,
  internal_links TEXT[], -- array of URLs
  created_at TIMESTAMP DEFAULT NOW()
);

-- Internal links within content
CREATE TABLE IF NOT EXISTS content_internal_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  target_content_id UUID REFERENCES content(id) ON DELETE SET NULL,
  link_text TEXT,
  target_url TEXT,
  link_type VARCHAR(50), -- related, comparison, product, cross_reference
  created_at TIMESTAMP DEFAULT NOW()
);

-- Content performance tracking
CREATE TABLE IF NOT EXISTS content_performance (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  pageviews INTEGER DEFAULT 0,
  sessions INTEGER DEFAULT 0,
  engagement_time DECIMAL(8,2), -- average seconds
  bounce_rate DECIMAL(5,2),
  scroll_depth DECIMAL(5,2),
  clicks INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  affiliate_clicks INTEGER DEFAULT 0,
  affiliate_conversions INTEGER DEFAULT 0,
  social_shares INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(content_id, date)
);

-- Content topics and trends
CREATE TABLE IF NOT EXISTS content_topics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL,
  topic TEXT NOT NULL,
  topic_category VARCHAR(100), -- pregnancy_week, age_stage, product_category, health_topic
  search_volume INTEGER,
  competition_level VARCHAR(50), -- low, medium, high
  trend VARCHAR(50), -- rising, stable, declining
  opportunity_score DECIMAL(5,2), -- 0-100
  content_count INTEGER DEFAULT 0,
  last_assessed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  UNIQUE(project_id, topic)
);

-- Content distribution tracking
CREATE TABLE IF NOT EXISTS content_distribution (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content_id UUID NOT NULL REFERENCES content(id) ON DELETE CASCADE,
  platform VARCHAR(50) NOT NULL, -- twitter, linkedin, facebook, email, newsletter
  platform_post_id TEXT,
  post_url TEXT,
  status VARCHAR(50), -- scheduled, published, failed
  published_at TIMESTAMP,
  impressions INTEGER DEFAULT 0,
  engagement INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_content_project_id ON content(project_id);
CREATE INDEX IF NOT EXISTS idx_content_status ON content(status);
CREATE INDEX IF NOT EXISTS idx_content_type ON content(content_type);
CREATE INDEX IF NOT EXISTS idx_content_published_at ON content(published_at);
CREATE INDEX IF NOT EXISTS idx_content_seo_content_id ON content_seo(content_id);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_content_id ON content_pipeline(content_id);
CREATE INDEX IF NOT EXISTS idx_content_pipeline_stage ON content_pipeline(stage_name);
CREATE INDEX IF NOT EXISTS idx_content_performance_date ON content_performance(date);
CREATE INDEX IF NOT EXISTS idx_content_topics_project_id ON content_topics(project_id);
CREATE INDEX IF NOT EXISTS idx_content_topics_opportunity ON content_topics(opportunity_score);
CREATE INDEX IF NOT EXISTS idx_content_distribution_platform ON content_distribution(platform);
CREATE INDEX IF NOT EXISTS idx_content_distribution_status ON content_distribution(status);
