/** Contract quirks of the KVMap helpers: the shapes AGH returns (v0.107.79
 *  single-key object arrays vs the legacy dictionary) and the top_clients key
 *  candidates are easy to break silently, so they are pinned here. */
import { describe, expect, it } from 'vitest'
import { kvCount, toMap, topEntries } from './stats'

describe('toMap', () => {
  it('merges the single-key object array shape', () => {
    expect(toMap([{ 'a.com': 3 }, { 'b.com': 1 }])).toEqual({ 'a.com': 3, 'b.com': 1 })
  })

  it('accepts the legacy dictionary shape unchanged', () => {
    expect(toMap({ 'a.com': 3 })).toEqual({ 'a.com': 3 })
  })

  it('treats missing or unusable values as an empty map', () => {
    expect(toMap(undefined)).toEqual({})
    expect(toMap(null)).toEqual({})
    expect(toMap([null, 5, { 'a.com': 1 }])).toEqual({ 'a.com': 1 })
  })
})

describe('topEntries', () => {
  it('sorts by count descending', () => {
    expect(topEntries([{ a: 1 }, { b: 9 }, { c: 5 }])).toEqual([
      ['b', 9],
      ['c', 5],
      ['a', 1],
    ])
  })

  it('keeps only the first n when n is given', () => {
    expect(topEntries({ a: 1, b: 2, c: 3 }, 2)).toEqual([
      ['c', 3],
      ['b', 2],
    ])
    expect(topEntries({ a: 1 }, 0)).toEqual([])
  })

  it('returns every entry when n is omitted', () => {
    expect(topEntries({ a: 1, b: 2 })).toHaveLength(2)
  })

  it('keeps insertion order for equal counts', () => {
    expect(topEntries([{ a: 1 }, { b: 1 }])).toEqual([
      ['a', 1],
      ['b', 1],
    ])
  })
})

describe('kvCount', () => {
  it('sums an exact key match', () => {
    expect(kvCount([{ '192.168.1.50': 10 }], ['192.168.1.50'])).toBe(10)
  })

  it('matches "name|IP" keys by their name half', () => {
    expect(kvCount([{ 'Cindy-MacBook|192.168.1.50': 7 }], ['Cindy-MacBook'])).toBe(7)
    // Only the name half is compared (k.split('|')[0]); every caller passes the name
    // next to the IP, so the candidate list still finds these entries
  })

  it('sums across several candidate keys in both shapes', () => {
    expect(kvCount([{ a: 1 }, { b: 2 }], ['a', 'b', 'missing'])).toBe(3)
    expect(kvCount({ a: 4 }, ['a'])).toBe(4)
  })

  it('ignores unrelated keys and undefined candidates', () => {
    expect(kvCount([{ other: 5 }], [undefined, 'a'])).toBeUndefined()
  })

  it('returns undefined when the map is missing', () => {
    expect(kvCount(undefined, ['a'])).toBeUndefined()
  })
})
