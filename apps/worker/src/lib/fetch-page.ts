import { isIP } from "node:net";

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…" };

export function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg|template|iframe)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<li\b[^>]*>/gi, "\n- ")
    .replace(/<\/?(p|li|div|section|article|header|footer|ul|ol|tr|table|h[1-6]|blockquote|pre|dd|dt|main|aside|nav)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
      return ENTITIES[code.toLowerCase()] ?? match;
    })
    .replace(/[ \t\f\v]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const PRIVATE_HOST = /^(localhost|.*\.local|.*\.internal)$/i;
const isPrivateIp = (host: string) => /^(10\.|127\.|0\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === "::1" || /^f[cd]/i.test(host) || /^fe80:/i.test(host);

export class PageFetchError extends Error {}

/** Fetches a public page as plain text. Pages are untrusted data. */
export async function fetchPageText(url: string, maxBytes = 2_000_000): Promise<{ url: string; text: string }> {
  const parsed = new URL(url);
  if (!/^https?:$/.test(parsed.protocol)) throw new PageFetchError(`Only http and https URLs are supported: ${url}`);
  const host = parsed.hostname.replace(/^\[|\]$/g, "");
  if (PRIVATE_HOST.test(host) || (isIP(host) && isPrivateIp(host))) throw new PageFetchError(`Refusing to fetch a private address: ${url}`);
  const response = await fetch(parsed, {
    redirect: "follow",
    headers: { "user-agent": "StageReady/0.1 (+event ingestion)", accept: "text/html,text/plain;q=0.9,*/*;q=0.5" },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new PageFetchError(`${url} returned ${response.status}.`);
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new PageFetchError(`${url} is larger than ${Math.round(maxBytes / 1_000_000)} MB.`);
  const body = buffer.toString("utf8");
  const type = response.headers.get("content-type") ?? "";
  return { url: response.url || url, text: /html|xml/i.test(type) || /<html|<body/i.test(body.slice(0, 2_000)) ? htmlToText(body) : body.trim() };
}
