import { describe, it, expect, vi } from 'vitest'
import {
  TOP_LEVEL_ROUTES,
  isDesktopSettingsTopLevel,
  isSettingsNavActive,
} from '../../lib/nav/routes'
import { navBack } from '../../lib/nav/backNav'

describe('Settings desktop navigation semantics', () => {
  function shouldShowBack(pathname: string, isDesktop: boolean, backProp: boolean = true) {
    const isTopLevel = TOP_LEVEL_ROUTES.includes(pathname) || isDesktopSettingsTopLevel(pathname, isDesktop)
    return backProp && !(isDesktop && isTopLevel)
  }

  it('evaluates isDesktopSettingsTopLevel correctly', () => {
    expect(isDesktopSettingsTopLevel('/settings/general', true)).toBe(true)
    expect(isDesktopSettingsTopLevel('/settings/dns', true)).toBe(true)
    expect(isDesktopSettingsTopLevel('/settings/access', true)).toBe(true)
    expect(isDesktopSettingsTopLevel('/settings/server', true)).toBe(true)
    expect(isDesktopSettingsTopLevel('/settings/about', true)).toBe(true)
    expect(isDesktopSettingsTopLevel('/settings/server/edit', true)).toBe(false)

    // False on mobile
    expect(isDesktopSettingsTopLevel('/settings/general', false)).toBe(false)
    expect(isDesktopSettingsTopLevel('/settings/server/edit', false)).toBe(false)

    // False for non-sub routes or top-level /settings
    expect(isDesktopSettingsTopLevel('/', true)).toBe(false)
    expect(isDesktopSettingsTopLevel('/protection', true)).toBe(false)
    expect(isDesktopSettingsTopLevel('/settings', true)).toBe(false)
  })

  it('hides back button on desktop for settings sub-pages with top-level semantics', () => {
    expect(shouldShowBack('/settings/general', true)).toBe(false)
    expect(shouldShowBack('/settings/dns', true)).toBe(false)
    expect(shouldShowBack('/settings/access', true)).toBe(false)
    expect(shouldShowBack('/settings/encryption', true)).toBe(false)
    expect(shouldShowBack('/settings/dhcp', true)).toBe(false)
    expect(shouldShowBack('/settings/system', true)).toBe(false)
    expect(shouldShowBack('/settings/snapshots', true)).toBe(false)
    expect(shouldShowBack('/settings/appearance', true)).toBe(false)
    expect(shouldShowBack('/settings/server', true)).toBe(false)
    expect(shouldShowBack('/settings/about', true)).toBe(false)
  })

  it('preserves back button on desktop for deep sub-pages like /settings/server/edit', () => {
    expect(shouldShowBack('/settings/server/edit', true)).toBe(true)
  })

  it('preserves floating back button on mobile (< lg) for all sub-pages', () => {
    expect(shouldShowBack('/settings/general', false)).toBe(true)
    expect(shouldShowBack('/settings/dns', false)).toBe(true)
    expect(shouldShowBack('/settings/access', false)).toBe(true)
    expect(shouldShowBack('/settings/server', false)).toBe(true)
    expect(shouldShowBack('/settings/server/edit', false)).toBe(true)
    expect(shouldShowBack('/settings/about', false)).toBe(true)
  })

  it('correctly categorizes active routes via isSettingsNavActive', () => {
    expect(isSettingsNavActive('/settings/general', '/settings/general')).toBe(true)
    expect(isSettingsNavActive('/settings/general', '/settings/dns')).toBe(false)
    expect(isSettingsNavActive('/settings/server', '/settings/server')).toBe(true)
    expect(isSettingsNavActive('/settings/server', '/settings/server/edit')).toBe(true)
    expect(isSettingsNavActive('/settings/server', '/settings/server/edit?id=1')).toBe(true)
    expect(isSettingsNavActive('/settings/server', '/settings/general')).toBe(false)
  })

  it('navBack replaces to immediate parent when history stack is empty', () => {
    const originalWindow = globalThis.window
    try {
      globalThis.window = {
        history: {
          state: { idx: 0 },
          replaceState: vi.fn(),
        },
      } as any
      const nav = vi.fn()

      navBack(nav as any, '/settings/server/edit')
      expect(nav).toHaveBeenCalledWith('/settings/server', { replace: true })

      nav.mockClear()
      navBack(nav as any, '/settings/server')
      expect(nav).toHaveBeenCalledWith('/settings', { replace: true })

      nav.mockClear()
      navBack(nav as any, '/settings')
      expect(nav).toHaveBeenCalledWith('/', { replace: true })
    } finally {
      globalThis.window = originalWindow
    }
  })
})
