import { describe, expect, it } from 'vitest'
import { parseTableRows } from '../src/services/fileImport'

describe('表格矢量输入', () => {
  it('读取 CSV/表格行并将 WKT 转为几何', () => {
    const source = parseTableRows([
      ['地块编码', '名称', 'WKT'],
      ['001', '一号地块', 'POLYGON ((112 22, 112.001 22, 112.001 22.001, 112 22.001, 112 22))'],
    ], '测试 CSV')
    expect(source.features).toHaveLength(1)
    expect(source.features[0].geometry?.type).toBe('Polygon')
    expect(source.features[0].properties.地块编码).toBe('001')
  })

  it('没有几何列时明确提示', () => {
    expect(() => parseTableRows([['编码', '名称'], ['001', '一号']], '测试表格')).toThrow('缺少几何列')
  })
})
