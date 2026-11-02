import { afterEach, describe, expect, it, vi } from 'vitest'
import { hasNativeSave, saveBlob, saveMessage } from '../src/utils/saveFile'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('saveFile', () => {
  it('reports no native bridge in a plain browser', async () => {
    const module = await import('../src/utils/saveFile')
    expect(module.hasNativeSave()).toBe(false)
    expect(hasNativeSave()).toBe(false)
  })

  it('hands the file to the desktop shell and returns the saved path', async () => {
    const seen: { name: string; data: string }[] = []
    vi.stubGlobal('window', {
      pywebview: {
        api: {
          save_file: (name: string, data: string) => {
            seen.push({ name, data })
            return { path: 'D:\\成果\\标准矢量.geojson' }
          },
        },
      },
    })
    expect(hasNativeSave()).toBe(true)
    const result = await saveBlob(new Blob([JSON.stringify({ ok: 1 })]), '标准矢量.geojson')
    expect(seen).toHaveLength(1)
    expect(seen[0].name).toBe('标准矢量.geojson')
    const decoded = Buffer.from(seen[0].data, 'base64').toString('utf8')
    expect(JSON.parse(decoded)).toEqual({ ok: 1 })
    expect(result).toEqual({ saved: true, path: 'D:\\成果\\标准矢量.geojson' })
    expect(saveMessage(result)).toBe('已保存到 D:\\成果\\标准矢量.geojson')
  })

  it('surfaces a cancelled dialog and shell errors', async () => {
    vi.stubGlobal('window', { pywebview: { api: { save_file: () => ({ cancelled: true }) } } })
    expect(await saveBlob(new Blob(['x']), 'a.csv')).toEqual({ saved: false, cancelled: true })
    expect(saveMessage({ saved: false, cancelled: true })).toBe('已取消保存')

    vi.unstubAllGlobals()
    vi.stubGlobal('window', { pywebview: { api: { save_file: () => ({ error: '磁盘已满' }) } } })
    expect(await saveBlob(new Blob(['x']), 'a.csv')).toEqual({ saved: false, error: '磁盘已满' })
    expect(saveMessage({ saved: false, error: '磁盘已满' })).toBe('磁盘已满')

    vi.unstubAllGlobals()
    vi.stubGlobal('window', { pywebview: { api: { save_file: () => { throw new Error('桥接中断') } } } })
    expect(await saveBlob(new Blob(['x']), 'a.csv')).toEqual({ saved: false, error: '桥接中断' })
  })

  it('falls back to a browser download when no bridge exists', async () => {
    const clicked: string[] = []
    vi.stubGlobal('window', {})
    vi.stubGlobal('document', {
      createElement: () => ({ click: () => clicked.push('click'), remove: () => {}, set href(value: string) {}, set download(value: string) {} }),
      body: { appendChild: () => {} },
    })
    const createObjectURL = vi.fn(() => 'blob:mock')
    const revokeObjectURL = vi.fn()
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })
    const result = await saveBlob(new Blob(['x']), 'a.csv')
    expect(result).toEqual({ saved: true })
    expect(createObjectURL).toHaveBeenCalledOnce()
    expect(clicked).toEqual(['click'])
    expect(saveMessage(result)).toBe('已开始下载')
    expect(saveMessage(result, '已保存')).toBe('已保存')
  })
})
