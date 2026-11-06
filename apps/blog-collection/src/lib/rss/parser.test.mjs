import assert from "node:assert/strict";
import { test } from "node:test";
import { parseRssFeed } from "./parser.ts";

test("parses a hoch.io-shaped Atom feed with HTML content and feed author", () => {
  const { channel, items } = parseRssFeed(`
    <feed xmlns="http://www.w3.org/2005/Atom">
      <title>hoch.io</title><subtitle>Audio &amp; Research</subtitle>
      <link href="https://hoch.io/feed.xml" rel="self"/>
      <link href="https://hoch.io/"/>
      <author><name>Hongchan Choi</name></author>
      <entry xml:lang="ko">
        <title>Example post</title><id>https://hoch.io/example/</id>
        <link href="https://hoch.io/example/"/>
        <updated>2026-11-01T00:00:00.000Z</updated>
        <content type="html">&lt;p&gt;Hello&lt;/p&gt;&lt;img src=&quot;https://hoch.io/image.png&quot;/&gt;</content>
      </entry>
    </feed>`);

  assert.equal(channel.title, "hoch.io");
  assert.equal(channel.link, "https://hoch.io/");
  assert.equal(channel.description, "Audio & Research");
  assert.equal(items.length, 1);
  assert.deepEqual(items[0], {
    guid: "https://hoch.io/example/",
    title: "Example post",
    link: "https://hoch.io/example/",
    description: '<p>Hello</p><img src="https://hoch.io/image.png"/>',
    author: "Hongchan Choi",
    category: undefined,
    pubDate: "2026-11-01T00:00:00.000Z",
    tags: [],
    thumbnail: "https://hoch.io/image.png",
  });
});

test("maps multiple Atom entries, alternate links, published dates and categories", () => {
  const { channel, items } = parseRssFeed(`
    <feed xmlns="http://www.w3.org/2005/Atom" xml:lang="en">
      <title>Example</title><link href="https://example.com/"/>
      <logo>https://example.com/logo.png</logo>
      <author><name>Feed author</name></author>
      <entry>
        <id>urn:post:1</id><title>First</title>
        <link rel="self" href="https://example.com/api/1"/>
        <link rel="alternate" type="text/html" href="https://example.com/1"/>
        <published>2026-10-01T00:00:00Z</published>
        <updated>2026-11-01T00:00:00Z</updated>
        <summary>Summary</summary><author><name>Post author</name></author>
        <category term="Audio"/><category term="Web"/><category term="Audio"/>
      </entry>
      <entry><title>Second</title><link href="https://example.com/2"/>
        <updated>2026-11-02T00:00:00Z</updated><category term="Music"/>
      </entry>
    </feed>`);

  assert.equal(channel.language, "en");
  assert.deepEqual(channel.image, { url: "https://example.com/logo.png" });
  assert.equal(items.length, 2);
  assert.equal(items[0].guid, "urn:post:1");
  assert.equal(items[0].link, "https://example.com/1");
  assert.equal(items[0].pubDate, "2026-10-01T00:00:00Z");
  assert.equal(items[0].author, "Post author");
  assert.equal(items[0].description, "Summary");
  assert.equal(items[0].category, "Audio");
  assert.deepEqual(items[0].tags, ["Audio", "Web"]);
  assert.equal(items[1].guid, "https://example.com/2");
  assert.equal(items[1].author, "Feed author");
  assert.deepEqual(items[1].tags, ["Music"]);
});

test("accepts an Atom feed without entries", () => {
  assert.deepEqual(parseRssFeed('<feed xmlns="http://www.w3.org/2005/Atom"><title>Empty</title></feed>').items, []);
});

test("preserves RSS 2.0 parsing, CDATA, guid attributes and tags", () => {
  const { channel, items } = parseRssFeed(`
    <rss version="2.0"><channel>
      <title>RSS blog</title><link>https://example.com</link>
      <description>RSS description</description><language>ko</language>
      <image><url>https://example.com/logo.png</url></image>
      <item><guid isPermaLink="false">post-1</guid><title>First</title>
        <link>https://example.com/1</link>
        <description><![CDATA[<p>Hello</p><img src="https://example.com/image.png"/>]]></description>
        <author>Writer</author><category>Tech</category>
        <pubDate>Sun, 01 Nov 2026 00:00:00 GMT</pubDate><tag>one, two</tag>
      </item>
      <item><title>Second</title><link>https://example.com/2</link></item>
    </channel></rss>`);

  assert.equal(channel.title, "RSS blog");
  assert.equal(channel.language, "ko");
  assert.equal(items.length, 2);
  assert.equal(items[0].guid, "post-1");
  assert.equal(items[0].thumbnail, "https://example.com/image.png");
  assert.deepEqual(items[0].tags, ["one", "two"]);
  assert.equal(items[1].guid, "https://example.com/2");
});

test("rejects documents without a supported feed", () => {
  assert.throws(() => parseRssFeed("<html><body>Not a feed</body></html>"), /Invalid RSS feed/);
});
