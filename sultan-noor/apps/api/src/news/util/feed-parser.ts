// A small, dependency-free RSS 2.0 / Atom feed parser. Deliberately not a
// full XML parser — it extracts only the handful of fields this app needs
// (title, link, summary, publish date, an optional image) via bounded
// regexes over each <item>/<entry> block. No script execution, no DTD/
// external-entity resolution, nothing that could turn a malicious feed body
// into anything more than inert text — the safest posture for content
// fetched from a third party.
export interface FeedItem {
  title: string;
  link: string;
  summary: string | null;
  publishedAt: Date | null;
  imageUrl: string | null;
}

function decodeEntities(text: string): string {
  return text
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/<[^>]+>/g, ' ') // strip any remaining inline markup (e.g. HTML inside <description>)
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTag(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return match ? decodeEntities(match[1]) : null;
}

function extractAttr(block: string, tag: string, attr: string): string | null {
  const match = block.match(new RegExp(`<${tag}[^>]*\\b${attr}=["']([^"']+)["'][^>]*/?>`, 'i'));
  return match ? match[1] : null;
}

function parseDate(raw: string | null): Date | null {
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isNaN(d.getTime()) ? null : d;
}

export function parseFeed(xml: string, maxItems = 50): FeedItem[] {
  const items: FeedItem[] = [];

  const rssBlocks = xml.match(/<item\b[^>]*>[\s\S]*?<\/item>/gi) ?? [];
  for (const block of rssBlocks.slice(0, maxItems)) {
    const title = extractTag(block, 'title');
    const link = extractTag(block, 'link') ?? extractAttr(block, 'link', 'href');
    if (!title || !link) continue;
    items.push({
      title,
      link,
      summary: extractTag(block, 'description') ?? extractTag(block, 'summary'),
      publishedAt: parseDate(extractTag(block, 'pubDate') ?? extractTag(block, 'published')),
      imageUrl: extractAttr(block, 'enclosure', 'url') ?? extractAttr(block, 'media:content', 'url') ?? extractAttr(block, 'media:thumbnail', 'url'),
    });
  }
  if (items.length > 0) return items;

  // Atom fallback — only tried when no RSS <item> blocks matched at all.
  const atomBlocks = xml.match(/<entry\b[^>]*>[\s\S]*?<\/entry>/gi) ?? [];
  for (const block of atomBlocks.slice(0, maxItems)) {
    const title = extractTag(block, 'title');
    const link = extractAttr(block, 'link', 'href') ?? extractTag(block, 'link');
    if (!title || !link) continue;
    items.push({
      title,
      link,
      summary: extractTag(block, 'summary') ?? extractTag(block, 'content'),
      publishedAt: parseDate(extractTag(block, 'published') ?? extractTag(block, 'updated')),
      imageUrl: null,
    });
  }
  return items;
}
