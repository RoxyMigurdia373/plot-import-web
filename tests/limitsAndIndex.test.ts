import { describe, expect, it, afterEach, vi } from 'vitest'
import { candidatePairs } from '../src/services/topology'

function brute(boxes: number[][]): Array<[number, number]> {
  const out: Array<[number, number]> = []
  for (let i = 0; i < boxes.length; i++)
    for (let j = i + 1; j < boxes.length; j++) {
      const a = boxes[i], b = boxes[j]
      if (!(a[2] < b[0] || b[2] < a[0] || a[3] < b[1] || b[3] < a[1])) out.push([i, j])
    }
  return out
}

function gridBoxes(rows: number, cols: number, size = 10, shift = 0): number[][] {
  const out: number[][] = []
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const x = c * size + (r % 2 ? shift : 0), y = r * size
      out.push([x, y, x + size, y + size])
    }
  return out
}

function seeded(seed: number): () => number {
  let state = seed
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648
    return state / 2147483648
  }
}

describe('candidatePairs', () => {
  it('returns nothing for fewer than two boxes', () => {
    expect(candidatePairs([])).toEqual([])
    expect(candidatePairs([[0, 0, 1, 1]])).toEqual([])
  })

  it('matches brute force on a small overlapping grid', () => {
    const boxes = gridBoxes(6, 6, 10, 5)
    expect(candidatePairs(boxes)).toEqual(brute(boxes))
  })

  it('matches brute force on random boxes above the brute-force threshold', () => {
    const random = seeded(42), boxes: number[][] = []
    for (let i = 0; i < 900; i++) {
      const x = random() * 400, y = random() * 400, w = 5 + random() * 40, h = 5 + random() * 40
      boxes.push([x, y, x + w, y + h])
    }
    const expected = brute(boxes).map(([i, j]) => `${i}:${j}`).sort()
    const actual = candidatePairs(boxes).map(([i, j]) => `${i}:${j}`).sort()
    expect(actual).toEqual(expected)
  })

  it('handles identical boxes and fully contained ones', () => {
    const boxes = [[0, 0, 100, 100], [0, 0, 100, 100], [10, 10, 20, 20], [200, 200, 300, 300]]
    expect(new Set(candidatePairs(boxes).map(([i, j]) => `${i}:${j}`))).toEqual(new Set(['0:1', '0:2', '1:2']))
  })

  it('finds the big feature when it spans many cells', () => {
    const boxes: number[][] = [[0, 0, 1000, 1000]]
    for (let i = 0; i < 800; i++) boxes.push([i * 1.2, 0, i * 1.2 + 1, 1])
    const actual = candidatePairs(boxes).filter(([i]) => i === 0 || i === undefined)
    expect(actual.length).toBe(800)
  })

  it('stays linear enough on 200k parcels', () => {
    const boxes = gridBoxes(400, 500, 10, 5)
    const started = Date.now()
    const pairs = candidatePairs(boxes)
    const elapsed = Date.now() - started
    expect(pairs.length).toBeGreaterThan(0)
    expect(elapsed).toBeLessThan(5000)
  })
})

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
