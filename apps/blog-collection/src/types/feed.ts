export interface Feed {
  id: string;
  rss_url: string;
  title: string;
  link: string | null;
  description: string | null;
  image_url: string | null;
  language: string | null;
  category: string | null;
  last_fetched_at: string | null;
  created_at: string;
}
