import { describe, it, expect } from 'vitest'
import { headerSlotGeometry } from './nativeHeaderAction'

/** Native header slots: each action needs its own component id, and a second
 *  action must land one 44pt capsule + 6px CSS gap further left. Both were
 *  violated by the first snapshots header (two actions on one id) — the loser's
 *  native button is deleted by the plugin and its CSS placeholder stays hidden. */
describe('native header slot geometry', () => {
  it('keeps slot 0 at the trailing inset', () => {
    expect(headerSlotGeometry(0)).toEqual({ id: 'nav-action', dx: 0 })
  })

  it('steps one 44pt capsule plus the CSS slot gap leftwards', () => {
    expect(headerSlotGeometry(1)).toEqual({ id: 'nav-action-2', dx: 50 })
    expect(headerSlotGeometry(2)).toEqual({ id: 'nav-action-3', dx: 100 })
    expect(headerSlotGeometry(1).dx - headerSlotGeometry(0).dx).toBe(44 + 6)
  })

  it('gives every slot a distinct component id', () => {
    const ids = [0, 1, 2, 3].map((s) => headerSlotGeometry(s).id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
