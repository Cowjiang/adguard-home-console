import { describe, expect, it, beforeEach } from 'vitest'
import { consumeLogDrill, markLogDrill, peekLogDrill } from './drillIntent'

describe('query log drill handoff', () => {
  beforeEach(() => consumeLogDrill())

  it('peeks without clearing so repeated reads stay stable', () => {
    markLogDrill({ q: 'example.org' })
    expect(peekLogDrill()).toEqual({ q: 'example.org' })
    expect(peekLogDrill()).toEqual({ q: 'example.org' })
  })

  it('drops the intent once consumed', () => {
    markLogDrill({ filter: 'blocked' })
    consumeLogDrill()
    expect(peekLogDrill()).toBeNull()
  })

  it('is empty before any drill happened', () => {
    expect(peekLogDrill()).toBeNull()
  })

  it('keeps only the latest intent', () => {
    markLogDrill({ q: 'a.example' })
    markLogDrill({ filter: 'whitelist' })
    expect(peekLogDrill()).toEqual({ filter: 'whitelist' })
  })
})
