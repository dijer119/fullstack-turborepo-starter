import { XMLParser } from "fast-xml-parser";
import type { RssChannel, RssItem } from "@/types/rss";

const parser = new XMLParser({
  ignoreAttributes: false,
  processEntities: true,
  htmlEntities: true,
  trimValues: true,
});

function extractCDATA(value: unknown): string {
  if (value == null) return "";
  if (typeof value === "object" && "#text" in (value as Record<string, unknown>)) {
    return String((value as Record<string, string>)["#text"]);
  }
  return String(value);
}

function normalizeItems(items: unknown): Record<string, unknown>[] {
  if (!items) return [];
  if (Array.isArray(items)) return items;
  return [items as Record<string, unknown>];
}

export function parseCommaTags(tagStr?: string | null): string[] {
  if (!tagStr) return [];
  return extractCDATA(tagStr)
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);
}

export function extractFirstImage(html?: string | null): string | undefined {
  if (!html) return undefined;
  const match = extractCDATA(html).match(/<img[^>]+src="([^"]+)"/);
  return match ? match[1] : undefined;
}

function extractAtomLink(value: unknown): string {
  const links = normalizeItems(value).filter(
    (link) => !link["@_rel"] || link["@_rel"] === "alternate"
  );
  const link = links.find((link) => link["@_type"] === "text/html") || links[0];
  return extractCDATA(link?.["@_href"]);
}

function extractAtomAuthor(value: unknown): string {
  return extractCDATA(normalizeItems(value)[0]?.name);
}

function parseAtomFeed(feed: Record<string, unknown>): {
  channel: RssChannel;
  items: RssItem[];
} {
  const image = extractCDATA(feed.logo) || extractCDATA(feed.icon);

  return {
    channel: {
      title: extractCDATA(feed.title),
      link: extractAtomLink(feed.link),
      description: extractCDATA(feed.subtitle),
      image: image ? { url: image } : undefined,
      language: extractCDATA(feed["@_xml:lang"]) || undefined,
    },
    items: normalizeItems(feed.entry).map((entry) => {
      const link = extractAtomLink(entry.link);
      const description = extractCDATA(entry.content) || extractCDATA(entry.summary);
      const tags = [...new Set(normalizeItems(entry.category)
        .map((category) => extractCDATA(category["@_term"]))
        .filter(Boolean))];

      return {
        guid: extractCDATA(entry.id) || link,
        title: extractCDATA(entry.title),
        link,
        description: description || undefined,
        author: extractAtomAuthor(entry.author) || extractAtomAuthor(feed.author) || undefined,
        category: tags[0],
        pubDate: extractCDATA(entry.published) || extractCDATA(entry.updated),
        tags,
        thumbnail: extractFirstImage(description),
      };
    }),
  };
}

export function parseRssFeed(xmlString: string): {
  channel: RssChannel;
  items: RssItem[];
} {
  const result = parser.parse(xmlString);
  const channel = result?.rss?.channel;

  if (!channel && result?.feed) {
    return parseAtomFeed(result.feed);
  }

  if (!channel) {
    throw new Error("Invalid RSS feed: no channel found");
  }

  return {
    channel: {
      title: extractCDATA(channel.title),
      link: extractCDATA(channel.link),
      description: extractCDATA(channel.description),
      image: channel.image ? { url: extractCDATA(channel.image.url) } : undefined,
      language: channel.language ? extractCDATA(channel.language) : undefined,
    },
    items: normalizeItems(channel.item).map((item: Record<string, unknown>) => ({
      guid: extractCDATA(item.guid) || extractCDATA(item.link),
      title: extractCDATA(item.title),
      link: extractCDATA(item.link),
      description: item.description ? extractCDATA(item.description) : undefined,
      author: item.author ? extractCDATA(item.author) : undefined,
      category: item.category ? extractCDATA(item.category) : undefined,
      pubDate: extractCDATA(item.pubDate),
      tags: parseCommaTags(item.tag as string | undefined),
      thumbnail: extractFirstImage(item.description as string | undefined),
    })),
  };
}
