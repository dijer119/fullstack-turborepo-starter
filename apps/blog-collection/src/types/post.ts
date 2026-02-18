import type { Feed } from "./feed";

export interface Post {
  id: string;
  feed_id: string;
  guid: string;
  title: string;
  link: string;
  description: string | null;
  author: string | null;
  category: string | null;
  thumbnail: string | null;
  pub_date: string;
  is_read: boolean;
  is_favorite: boolean;
  created_at: string;
}

export interface PostWithFeed extends Post {
  feed: Pick<Feed, "title" | "image_url">;
}

export interface PostTag {
  id: string;
  post_id: string;
  tag: string;
}
