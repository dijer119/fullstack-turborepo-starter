-- feeds 테이블
CREATE TABLE feeds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rss_url TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  link TEXT,
  description TEXT,
  image_url TEXT,
  language TEXT,
  category TEXT,
  last_fetched_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- posts 테이블
CREATE TABLE posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id UUID NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,
  title TEXT NOT NULL,
  link TEXT NOT NULL,
  description TEXT,
  author TEXT,
  category TEXT,
  thumbnail TEXT,
  pub_date TIMESTAMPTZ NOT NULL,
  is_read BOOLEAN DEFAULT FALSE,
  is_favorite BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(feed_id, guid)
);

CREATE INDEX idx_posts_feed_id ON posts(feed_id);
CREATE INDEX idx_posts_pub_date ON posts(pub_date DESC);
CREATE INDEX idx_posts_is_read ON posts(is_read);
CREATE INDEX idx_posts_is_favorite ON posts(is_favorite);

-- post_tags 테이블
CREATE TABLE post_tags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  tag TEXT NOT NULL,
  UNIQUE(post_id, tag)
);

CREATE INDEX idx_post_tags_post_id ON post_tags(post_id);
CREATE INDEX idx_post_tags_tag ON post_tags(tag);

-- RLS (개인 사용이므로 anon 접근 허용)
ALTER TABLE feeds ENABLE ROW LEVEL SECURITY;
ALTER TABLE posts ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all for anon" ON feeds FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON posts FOR ALL USING (true);
CREATE POLICY "Allow all for anon" ON post_tags FOR ALL USING (true);
