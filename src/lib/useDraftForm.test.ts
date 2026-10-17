import { describe, expect, it } from 'vitest'
import { draftFollow, type DraftFollow } from './useDraftForm'

describe('draftFollow', () => {
  // Full truth table: [edited, isNewPayload, matchesServer] → action
  const table: Array<[boolean, boolean, boolean, DraftFollow]> = [
    // Never edited: the draft tracks whatever the server last sent
    [false, true, false, 'adopt'],
    [false, true, true, 'adopt'],
    [false, false, false, 'keep'],
    [false, false, true, 'keep'],
    // Edited: the user's draft wins until it matches the server copy again
    [true, true, false, 'keep'],
    [true, true, true, 'release'],
    [true, false, false, 'keep'],
    [true, false, true, 'release'],
  ]

  it.each(table)('edited=%s isNewPayload=%s matchesServer=%s → %s', (edited, isNewPayload, matchesServer, expected) => {
    expect(draftFollow({ edited, isNewPayload, matchesServer })).toBe(expected)
  })

  it('a stale draft mounted from cache is replaced once the refetch lands', () => {
    // The page mounted on the pre-restore cache (edited=false, the payload the
    // draft was projected from is the stale one), then revalidation delivered
    // the restored payload
    expect(draftFollow({ edited: false, isNewPayload: true, matchesServer: false })).toBe('adopt')
  })

  it('an in-flight edit survives a background refresh', () => {
    expect(draftFollow({ edited: true, isNewPayload: true, matchesServer: false })).toBe('keep')
  })
})
