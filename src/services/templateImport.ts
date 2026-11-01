import * as XLSX from 'xlsx'
import type { TemplateColumn, TemplateDefinition } from '../types'

export const MAX_TEMPLATE_COLUMNS = 200
const SAMPLE_ROWS = 5

export interface HeaderGrid { headers: string[]; sheetName: string; samples: unknown[][] }

function clean(value: unknown): string {
  return String(value ?? '')
    .replace(/\uFEFF/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function isEmpty(value: unknown): boolean {
  return value === null || value === undefined || clean(value) === ''
}

/** 表头允许重名？不允许；重名时补序号，保证列可区分。 */
export function dedupeHeaders(headers: string[]): string[] {
  const used = new Map<string, number>()
  return headers.map((header, index) => {
    const base = header || `字段${index + 1}`
    const seen = used.get(base) || 0
    used.set(base, seen + 1)
    return seen === 0 ? base : `${base}(${seen + 1})`
  })
}

/** 从表头行生成模板定义：列顺序与表头一致，键名用稳定的 col_N。 */
export function templateFromHeaders(
  headers: string[],
  options: { id?: string; name?: string; description?: string; sheetName?: string; samples?: unknown[][] } = {},
): TemplateDefinition {
  const raw = headers.map(clean)
  while (raw.length && !raw[raw.length - 1]) raw.pop()
  const firstEmpty = raw.findIndex((header) => !header)
  if (firstEmpty >= 0) throw new Error(`第 ${firstEmpty + 1} 列表头为空，请补齐后再导入`)
  if (!raw.length) throw new Error('没有读到表头，请检查文件首行')
  if (raw.length > MAX_TEMPLATE_COLUMNS) throw new Error(`表头最多 ${MAX_TEMPLATE_COLUMNS} 列，当前 ${raw.length} 列`)
  const headersClean = dedupeHeaders(raw)
  const samples = (options.samples || []).slice(0, SAMPLE_ROWS)
  const columns: TemplateColumn[] = headersClean.map((header, index) => {
    const values = samples.map((row) => row?.[index]).filter((value) => !isEmpty(value))
    const numeric = values.length > 0 && values.every((value) => typeof value === 'number' || /^-?\d+(\.\d+)?$/.test(String(value).trim()))
    return {
      key: `col_${index + 1}`,
      header,
      group: 'basic',
      order: index + 1,
      dataType: numeric ? 'number' : 'string',
    }
  })
  return {
    id: options.id || `custom-${Date.now().toString(36)}`,
    version: 'custom-v1',
    sheetName: options.sheetName || options.name || '导入模板',
    headerRows: 1,
    columns,
  }
}

/** 兼容 CSV / XLSX：取第一张工作表，跳过标题行后按首个多列表头行解析。 */
export function readHeaderGrid(data: ArrayBuffer | string): HeaderGrid {
  const workbook = typeof data === 'string' ? XLSX.read(data, { type: 'string', raw: true }) : XLSX.read(data, { type: 'array', raw: true, cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('工作表为空')
  const grid = XLSX.utils.sheet_to_json<unknown[]>(workbook.Sheets[sheetName], { header: 1, defval: '', blankrows: false, raw: true })
  const headerIndex = grid.findIndex((row) => row.filter((value) => !isEmpty(value)).length >= 2)
  const fallback = grid.findIndex((row) => row.some((value) => !isEmpty(value)))
  const index = headerIndex >= 0 ? headerIndex : fallback
  if (index < 0) throw new Error('工作表没有任何内容')
  const headers = (grid[index] || []).map((value) => clean(value))
  return { headers, sheetName, samples: grid.slice(index + 1) }
}

export async function importTemplateFile(file: File): Promise<{ definition: TemplateDefinition; fileName: string; sheetName: string }> {
  const isText = /\.(csv|txt)$/i.test(file.name)
  const payload = isText ? await file.text() : await file.arrayBuffer()
  let grid: HeaderGrid
  try {
    grid = readHeaderGrid(payload as ArrayBuffer | string)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${file.name}：${message}`)
  }
  const baseName = file.name.replace(/\.[^.]+$/, '')
  const definition = templateFromHeaders(grid.headers, {
    name: baseName,
    description: `由 ${file.name} 表头生成`,
    sheetName: grid.sheetName,
    samples: grid.samples,
  })
  return { definition, fileName: file.name, sheetName: grid.sheetName }
}
