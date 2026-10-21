import { describe, expect, it } from 'vitest'
import { extractLinks } from '../links'

describe('extractLinks', () => {
  it('finds http(s) links and strips trailing punctuation', () => {
    const links = extractLinks('Submit at https://canvas.uab.edu/courses/1/assignments/9. Notes: (see http://www.example.com/a)')
    expect(links).toEqual([
      { url: 'https://canvas.uab.edu/courses/1/assignments/9', host: 'canvas.uab.edu' },
      { url: 'http://www.example.com/a', host: 'example.com' },
    ])
  })

  it('ignores non-web schemes and malformed URLs', () => {
    expect(extractLinks('javascript:alert(1) data:text/html,hi ftp://x.org https://')).toEqual([])
  })

  it('dedupes and caps at three', () => {
    const text = 'https://a.com https://a.com https://b.com https://c.com https://d.com'
    expect(extractLinks(text).map((l) => l.host)).toEqual(['a.com', 'b.com', 'c.com'])
  })

  it('returns nothing for plain text', () => {
    expect(extractLinks('Email mentee tomorrow')).toEqual([])
  })
})
