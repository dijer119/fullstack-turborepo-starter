export interface RssChannel {
  title: string;
  link: string;
  description: string;
  image?: { url: string };
  language?: string;
}

export interface RssItem {
  guid: string;
  title: string;
  link: string;
  description?: string;
  author?: string;
  category?: string;
  pubDate: string;
  tags: string[];
  thumbnail?: string;
}
