import { describe,it,expect,beforeEach,vi } from 'vitest'
import { createPinia,setActivePinia } from 'pinia'
import * as XLSX from 'xlsx'
import { templateFromHeaders,readHeaderGrid,importTemplateFile,dedupeHeaders } from '../src/services/templateImport'
import { useTemplateStore } from '../src/stores/templateStore'
import { generatePair,GEOMETRY_SOURCE } from '../src/services/simplePipeline'
import type { RawVector } from '../src/services/simplePipeline'
import type { TemplateDefinition } from '../src/types'

function stubStorage() {
  const data = new Map<string,string>()
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value) },
    removeItem: (key: string) => { data.delete(key) },
  })
  return data
}

const builtin = (): TemplateDefinition => ({
  id: 'demo', version: 'v1', sheetName: '示例', headerRows: 1,
  columns: [
    { key: 'plot_code', header: '区块编码', group: 'basic', order: 1, dataType: 'string' },
    { key: 'area_mu', header: '实际面积/亩', group: 'basic', order: 2, dataType: 'number' },
  ],
})

const square = (): RawVector => ({
  type: 'FeatureCollection',
  features: [{ type: 'Feature', geometry: { type: 'Polygon', coordinates: [[[0,0],[1,0],[1,1],[0,1],[0,0]]] }, properties: { PLC: '甲-01', MJ: 12.5 } }],
})

beforeEach(() => { stubStorage(); setActivePinia(createPinia()) })

describe('表头生成模板', () => {
  it('按表头顺序生成列，去掉首尾空白并自动编号键名', () => {
    const definition = templateFromHeaders(['  区块编码 ', '地块面积(亩)', '备注'])
    expect(definition.columns.map(c => c.header)).toEqual(['区块编码', '地块面积(亩)', '备注'])
    expect(definition.columns.map(c => c.key)).toEqual(['col_1', 'col_2', 'col_3'])
    expect(definition.columns.map(c => c.order)).toEqual([1, 2, 3])
    expect(definition.columns.every(c => c.group === 'basic')).toBe(true)
  })

  it('重名表头自动补序号，尾随空列被忽略，中间空列报错', () => {
    expect(dedupeHeaders(['面积', '面积', '面积'])).toEqual(['面积', '面积(2)', '面积(3)'])
    expect(templateFromHeaders(['编号', '面积', '', '']).columns).toHaveLength(2)
    expect(() => templateFromHeaders(['编号', '', '面积'])).toThrow('第 2 列表头为空')
    expect(() => templateFromHeaders([])).toThrow('表头')
  })

  it('按前几行样本推断数值列', () => {
    const definition = templateFromHeaders(['编码', '面积', '备注'], { samples: [['A', 1.5, 'x'], ['B', '2', 'y']] })
    expect(definition.columns.map(c => c.dataType)).toEqual(['string', 'number', 'string'])
  })

  it('允许超过 200 列时报错', () => {
    expect(() => templateFromHeaders(Array.from({ length: 201 }, (_, i) => `字段${i}`))).toThrow('200')
  })

  it('CSV 首个多行表头作为表头，前面的标题行被跳过', () => {
    const csv = '\uFEFF导出时间：2026-01-01\n区块编码,地块面积(亩),备注\nA-01,12.5,甲\nA-02,8,乙\n'
    const grid = readHeaderGrid(csv)
    expect(grid.headers).toEqual(['区块编码', '地块面积(亩)', '备注'])
    expect(grid.samples).toHaveLength(2)
  })

  it('XLSX 文本与文件都能解析出表头', async () => {
    const sheet = XLSX.utils.aoa_to_sheet([['村庄名称', '农户数'], ['甲村', 12]])
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, sheet, '村表')
    const buffer = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer
    expect(readHeaderGrid(buffer).headers).toEqual(['村庄名称', '农户数'])
    const file = new File([buffer], '村表模板.xlsx')
    const imported = await importTemplateFile(file)
    expect(imported.definition.columns.map(c => c.header)).toEqual(['村庄名称', '农户数'])
    expect(imported.definition.columns[1].dataType).toBe('number')
    expect(imported.fileName).toBe('村表模板.xlsx')
  })
})

describe('模板库：保存、复用与字段编辑', () => {
  it('自建模板保存后重建 store 仍然存在，并可改名与删除', () => {
    const store = useTemplateStore()
    const id = store.saveAsTemplate({ name: '甲公司上传模板', description: '2026 版', definition: builtin(), origin: 'import' })
    expect(store.records.map(r => r.name)).toContain('甲公司上传模板')

    setActivePinia(createPinia())
    const reopened = useTemplateStore()
    const saved = reopened.record(id)
    expect(saved?.name).toBe('甲公司上传模板')
    expect(saved?.definition.columns).toHaveLength(2)
    expect(saved?.builtin).toBe(false)

    reopened.rename(id, '乙公司模板')
    setActivePinia(createPinia())
    expect(useTemplateStore().record(id)?.name).toBe('乙公司模板')
    expect(useTemplateStore().remove(id)).toBe(true)
    setActivePinia(createPinia())
    expect(useTemplateStore().record(id)).toBeNull()
  })

  it('名称不能为空，内置模板不能直接改名', () => {
    const store = useTemplateStore()
    store.registerBuiltin('demo', '内置示例', '', builtin())
    expect(() => store.saveAsTemplate({ name: '   ', definition: builtin() })).toThrow('模板名称')
    expect(() => store.rename('demo', '换个名字')).toThrow('内置模板')
  })

  it('修改内置模板字段会记住，重开仍在，恢复默认后还原', () => {
    const store = useTemplateStore()
    store.registerBuiltin('demo', '内置示例', '', builtin())
    store.updateDefinition('demo', (definition) => {
      definition.columns[0].header = '地块编号'
      definition.columns.push({ key: 'col_3', header: '备注', group: 'basic', order: 3, dataType: 'string' })
    })
    expect(store.definition('demo')?.columns.map(c => c.header)).toEqual(['地块编号', '实际面积/亩', '备注'])
    expect(store.record('demo')?.edited).toBe(true)

    setActivePinia(createPinia())
    const reopened = useTemplateStore()
    reopened.registerBuiltin('demo', '内置示例', '', builtin())
    expect(reopened.record('demo')?.edited).toBe(true)
    expect(reopened.definition('demo')?.columns[0].header).toBe('地块编号')

    reopened.resetBuiltin('demo')
    setActivePinia(createPinia())
    const reset = useTemplateStore()
    reset.registerBuiltin('demo', '内置示例', '', builtin())
    expect(reset.record('demo')?.edited).toBe(false)
    expect(reset.definition('demo')?.columns[0].header).toBe('区块编码')
  })

  it('模板至少保留一个字段', () => {
    const store = useTemplateStore()
    store.registerBuiltin('demo', '内置示例', '', builtin())
    store.updateDefinition('demo', (definition) => { definition.columns.splice(0, 1) })
    expect(store.definition('demo')?.columns).toHaveLength(1)
    expect(() => store.updateDefinition('demo', (definition) => { definition.columns.length = 0 })).toThrow('至少')
  })
})

describe('固定值映射', () => {
  it('固定值原样写入每个要素，与字段映射、几何映射共存', () => {
    const vector = generatePair(square(), { col_1: 'field:PLC', col_2: 'value:每行都写这段文本', col_3: GEOMETRY_SOURCE }, {
      id: 't', version: '1', sheetName: '表', headerRows: 1,
      columns: [
        { key: 'col_1', header: '地块编号', group: 'basic', order: 1, dataType: 'string' },
        { key: 'col_2', header: '数据来源', group: 'basic', order: 2, dataType: 'string' },
        { key: 'col_3', header: '边界', group: 'basic', order: 3, dataType: 'string' },
      ],
    })
    const properties = vector.geojson.features[0].properties as Record<string, unknown>
    expect(properties['地块编号']).toBe('甲-01')
    expect(properties['数据来源']).toBe('每行都写这段文本')
    expect(String(properties['边界'])).toContain('POLYGON')
  })
})
