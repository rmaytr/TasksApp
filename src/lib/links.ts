export interface FoundLink {
  url: string
  host: string
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"'`]+/gi
const TRAILING_PUNCTUATION = /[).,;:!?\]}]+$/
const MAX_LINKS = 3

/**
 * Finds web links in free text so they can be shown as "open" chips. Only http(s)
 * URLs that parse cleanly are returned; anything else (javascript:, data:) never matches.
 */
export function extractLinks(text: string): FoundLink[] {
  const seen = new Set<string>()
  const found: FoundLink[] = []
  for (const match of text.matchAll(URL_PATTERN)) {
    const raw = match[0].replace(TRAILING_PUNCTUATION, '')
    let parsed: URL
    try {
      parsed = new URL(raw)
    } catch {
      continue
    }
    if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') continue
    if (seen.has(parsed.href)) continue
    seen.add(parsed.href)
    found.push({ url: parsed.href, host: parsed.hostname.replace(/^www\./, '') })
    if (found.length === MAX_LINKS) break
  }
  return found
}
