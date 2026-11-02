import { describe, expect, it } from 'vitest'
import { decodeTableBytes, encodingLabel, readTextFile } from '../src/utils/textEncoding'
import { importVectorFiles } from '../src/services/fileImport'
import { importTemplateFile } from '../src/services/templateImport'

const WKT = 'POLYGON ((112 22, 112.001 22, 112.001 22.001, 112 22.001, 112 22))'

function bytes(...values: number[]): Uint8Array {
  return new Uint8Array(values)
}

/** ‘水田’ 的 GBK 编码 */
const GBK_WATER_FIELD = bytes(0xcb, 0xae, 0xcc, 0xef)

function csvFile(parts: (string | Uint8Array)[], name = 'parcels.csv'): File {
  const chunks = parts.map((part) => (typeof part === 'string' ? new TextEncoder().encode(part) : part))
  const size = chunks.reduce((sum, chunk) => sum + chunk.length, 0)
  const buffer = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) {
    buffer.set(chunk, offset)
    offset += chunk.length
  }
  return new File([buffer], name, { type: 'text/csv' })
}

describe('CSV 字节解码', () => {
  it('无 BOM 的 UTF-8 直接按 UTF-8 读', () => {
    const decoded = decodeTableBytes(new TextEncoder().encode('名称,编码\n水田,001'))
    expect(decoded.encoding).toBe('utf-8')
    expect(decoded.text).toBe('名称,编码\n水田,001')
  })

  it('去掉 UTF-8 BOM', () => {
    const raw = new TextEncoder().encode('名称\n水田')
    const withBom = new Uint8Array(raw.length + 3)
    withBom.set([0xef, 0xbb, 0xbf])
    withBom.set(raw, 3)
    const decoded = decodeTableBytes(withBom)
    expect(decoded.encoding).toBe('utf-8')
    expect(decoded.text.startsWith('名称')).toBe(true)
  })

  it('识别带 BOM 的 UTF-16LE', () => {
    const raw = new TextEncoder().encode('a,b')
    const utf16 = new Uint8Array(2 + raw.length * 2)
    utf16.set([0xff, 0xfe])
    for (let i = 0; i < raw.length; i++) {
      utf16[2 + i * 2] = raw[i]
      utf16[3 + i * 2] = 0
    }
    const decoded = decodeTableBytes(utf16)
    expect(decoded.encoding).toBe('utf-16le')
    expect(decoded.text).toBe('a,b')
  })

  it('GBK 字节退到 GB18030 解码', () => {
    const decoded = decodeTableBytes(bytes(0xd6, 0xd0, 0xce, 0xc4))
    expect(decoded.encoding).toBe('gb18030')
    expect(decoded.text).toBe('中文')
  })

  it('编码名可读', () => {
    expect(encodingLabel('gb18030')).toBe('GBK/GB18030')
    expect(encodingLabel('utf-8')).toBe('UTF-8')
  })
})

describe('CSV 导入不再是乱码', () => {
  it('GBK 编码的 CSV 属性值按原样读出', async () => {
    const file = csvFile(['name,geo\n', GBK_WATER_FIELD, `,"${WKT}"\n`])
    const { vector } = await importVectorFiles([file])
    expect(vector.features).toHaveLength(1)
    expect(vector.features[0].properties.name).toBe('水田')
    expect(vector.features[0].geometry?.type).toBe('Polygon')
  })

  it('UTF-8 编码的 CSV 中文表头与值都正常', async () => {
    const file = csvFile([`名称,geo\n水田,"${WKT}"\n`])
    const { vector } = await importVectorFiles([file])
    expect(Object.keys(vector.features[0].properties)).toContain('名称')
    expect(vector.features[0].properties.名称).toBe('水田')
  })

  it('导入表头生成模板时 GBK 表头不乱码', async () => {
    const header = bytes(0xb5, 0xd8, 0xbf, 0xe9, 0xb1, 0xe0, 0xc2, 0xeb) // 地块编码
    const nameHeader = bytes(0xc3, 0xfb, 0xb3, 0xc6) // 名称
    const file = csvFile([header, ',', nameHeader, '\n001,', GBK_WATER_FIELD, '\n'])
    const { definition } = await importTemplateFile(file)
    expect(definition.columns.map((column) => column.header)).toEqual(['地块编码', '名称'])
  })

  it('readTextFile 返回编码信息', async () => {
    const decoded = await readTextFile(csvFile(['a\n1\n']))
    expect(decoded.encoding).toBe('utf-8')
    expect(decoded.text).toBe('a\n1\n')
  })
})
