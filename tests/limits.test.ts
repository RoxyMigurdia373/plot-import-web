import { describe, expect, it, afterEach, vi } from 'vitest'

describe('limits', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('defaults to the web budget without query flags', async () => {
    vi.resetModules()
    const module = await import('../src/services/limits')
    expect(module.limits.profile).toBe('web')
    expect(module.limits.maxFeatures).toBe(200_000)
    expect(module.limitSummary).toBe('最多 20 万要素 / 200 MB')
  })

  it('switches to the desktop budget with local=1', async () => {
    vi.resetModules()
    vi.stubGlobal('window', { location: { search: '?local=1' } })
    const module = await import('../src/services/limits')
    expect(module.limits.profile).toBe('desktop')
    expect(module.limits.maxFeatures).toBe(1_000_000)
    expect(module.limitSummary).toBe('最多 100 万要素 / 2 GB')
  })

  it('accepts explicit overrides for tests', async () => {
    vi.resetModules()
    vi.stubGlobal('window', { location: { search: '?local=1' }, __PLOT_IMPORT_LIMITS__: { maxFeatures: 5, maxFileBytes: 1024 } })
    const module = await import('../src/services/limits')
    expect(module.limits.maxFeatures).toBe(5)
    expect(module.limits.maxFileBytes).toBe(1024)
    expect(module.formatBytes(1536)).toBe('1.5 KB')
    expect(module.formatBytes(3 * 1024 ** 3)).toBe('3 GB')
    expect(module.formatCount(25_000)).toBe('2.5 万')
  })
})
