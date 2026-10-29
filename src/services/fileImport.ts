import * as XLSX from 'xlsx'
import { unzipSync } from 'fflate'
import shpjs from 'shpjs'
import wellknown from 'wellknown'
import type { Feature, FeatureCollection, Geometry, GeoJsonProperties } from 'geojson'
import { parseVector } from './simplePipeline'
import type { RawVector } from './simplePipeline'

const MAX_FILE_BYTES = 10 * 1024 * 1024
const MAX_FEATURES = 250
const geometryHeader = /^(?:geometry|geom|thegeom|wkt|geowkt|geometrywkt|geometryjson|geojson|shape|地块边界|边界坐标|坐标集|空间信息|几何)$/i
const geometryValue = /^\s*(?:SRID\s*=\s*\d+\s*;\s*)?(?:POINT|MULTIPOINT|LINESTRING|MULTILINESTRING|POLYGON|MULTIPOLYGON|GEOMETRYCOLLECTION)\b/i

function empty(value: unknown): boolean {
  return value === null || value === undefined || (typeof value === 'string' && value.trim() === '')
}

function normalizeHeader(value: unknown): string {
  return String(value ?? '').trim().replace(/[\s_\-（）()]/g, '').toLowerCase()
}

function parseGeometryCell(value: unknown, row: number, field: string): Geometry | null {
  if (empty(value)) return null
  if (typeof value === 'object' && value !== null) {
    const candidate = 'geometry' in value ? (value as { geometry?: unknown }).geometry : value
    if (isGeometry(candidate)) return candidate
  }
  const text = String(value).trim()
  try {
    const json: unknown = JSON.parse(text)
    const candidate = json && typeof json === 'object' && 'geometry' in json
      ? (json as { geometry?: unknown }).geometry
      : json
    if (isGeometry(candidate)) return candidate
  } catch {
    // Geometry values may be WKT rather than JSON.
  }
  const parsed = wellknown.parse(text)
  if (parsed && isGeometry(parsed)) return parsed
  throw new Error(`第 ${row} 行的几何字段“${field}”无法识别；请使用 WGS84 WKT 或 GeoJSON 几何`)
}

function isGeometry(value: unknown): value is Geometry {
  if (!value || typeof value !== 'object' || !('type' in value)) return false
  const type = (value as { type?: unknown }).type
  return ['Point', 'MultiPoint', 'LineString', 'MultiLineString', 'Polygon', 'MultiPolygon', 'GeometryCollection'].includes(String(type))
}

function findGeometryColumn(headers: string[], dataRows: unknown[][]): number {
  const named = headers.findIndex(header => geometryHeader.test(normalizeHeader(header)))
  if (named >= 0) return named
  for (let column = 0; column < headers.length; column++) {
    if (dataRows.some(row => typeof row[column] === 'string' && geometryValue.test(row[column] as string))) return column
  }
  return -1
}

export function parseTableRows(grid: unknown[][], sourceName = '表格'): RawVector {
  const headerIndex = grid.findIndex(row => row.some(value => !empty(value)))
  if (headerIndex < 0) throw new Error('表格为空')
  const headers = (grid[headerIndex] || []).map(value => String(value ?? '').trim())
  if (headers.filter(Boolean).length < 2) throw new Error('表格首行需要包含字段表头')
  if (headers.some(header => !header)) throw new Error('表格存在空字段名，请补齐表头后重试')
  if (new Set(headers).size !== headers.length) throw new Error('表格存在重复字段名，请先调整表头后重试')
  const rows = grid.slice(headerIndex + 1).filter(row => row.some(value => !empty(value)))
  if (!rows.length) throw new Error('表格没有数据行')
  if (rows.length > MAX_FEATURES) throw new Error('本地原型最多处理250行，请分批处理')
  const geometryIndex = findGeometryColumn(headers, rows)
  if (geometryIndex < 0) throw new Error('表格缺少几何列；请添加“WKT / GeoJSON / 地块边界”列，并提供 Polygon 面几何')
  const features: RawVector['features'] = rows.map((row, index) => {
    const geometry = parseGeometryCell(row[geometryIndex], headerIndex + index + 2, headers[geometryIndex])
    const properties: Record<string, unknown> = {}
    headers.forEach((header, column) => {
      if (column !== geometryIndex) properties[header] = row[column] instanceof Date ? (row[column] as Date).toISOString() : row[column] ?? null
    })
    return { type: 'Feature', geometry, properties }
  })
  return validateCollection({ type: 'FeatureCollection', features }, sourceName)
}

function validateCollection(data: unknown, sourceName: string): RawVector {
  try {
    return parseVector(JSON.stringify(data))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`${sourceName}：${message}`)
  }
}

function singleLayer(result: Awaited<ReturnType<typeof shpjs.parseZip>>, fileName: string): FeatureCollection<Geometry | null, GeoJsonProperties> {
  if (Array.isArray(result)) throw new Error('压缩包内包含多个 Shapefile 图层；请一次上传一个图层')
  return result as FeatureCollection<Geometry | null, GeoJsonProperties>
}

function verifyShapefileSet(entries: Record<string, Uint8Array>, fileName: string): void {
  const paths = Object.keys(entries).filter(path => !path.includes('__MACOSX'))
  const shapes = paths.filter(path => path.toLowerCase().endsWith('.shp'))
  if (shapes.length !== 1) throw new Error(`${fileName} 需要且只能包含一个 .shp 图层`)
  const base = shapes[0].slice(0, -4).toLowerCase()
  const extensions = new Set(paths.map(path => {
    const dot = path.lastIndexOf('.')
    return dot < 0 ? '' : `${path.slice(0, dot).toLowerCase()}${path.slice(dot).toLowerCase()}`
  }))
  for (const extension of ['.shp', '.dbf', '.prj']) {
    if (!extensions.has(`${base}${extension}`)) throw new Error(`Shapefile 缺少同名 .${extension.slice(1).toUpperCase()} 文件`)
  }
}

async function importZip(file: File): Promise<RawVector> {
  const buffer = new Uint8Array(await file.arrayBuffer())
  const entries = unzipSync(buffer)
  verifyShapefileSet(entries, file.name)
  const result = await shpjs.parseZip(buffer)
  return validateCollection(singleLayer(result, file.name), file.name)
}

async function importLooseShapefile(files: File[], shpFile: File): Promise<RawVector> {
  const stem = shpFile.name.replace(/\.shp$/i, '').toLowerCase()
  const sidecar = (extension: string) => files.find(file => file.name.toLowerCase() === `${stem}.${extension}`)
  const dbf = sidecar('dbf')
  const prj = sidecar('prj')
  if (!dbf) throw new Error('SHP 缺少同名 .DBF 属性表；请同时选择 .shp、.dbf 和 .prj 文件')
  if (!prj) throw new Error('SHP 缺少同名 .PRJ 坐标系文件；无法安全判断是否为 WGS84')
  const cpg = sidecar('cpg')
  const result = await shpjs({
    shp: new Uint8Array(await shpFile.arrayBuffer()),
    dbf: new Uint8Array(await dbf.arrayBuffer()),
    prj: await prj.text(),
    ...(cpg ? { cpg: new Uint8Array(await cpg.arrayBuffer()) } : {}),
  } as unknown as Parameters<typeof shpjs>[0])
  return validateCollection(result, shpFile.name)
}

async function importSpreadsheet(file: File): Promise<RawVector> {
  const workbook = XLSX.read(await file.arrayBuffer(), { type: 'array', raw: true, cellDates: true })
  const sheetName = workbook.SheetNames[0]
  if (!sheetName) throw new Error('工作簿中没有可读取的工作表')
  const sheet = workbook.Sheets[sheetName]
  const range = sheet['!ref'] ? XLSX.utils.decode_range(sheet['!ref']) : null
  if (!range) throw new Error('工作表为空')
  if (range.e.r - range.s.r > MAX_FEATURES + 10) throw new Error('表格行数超过本地处理上限，请分批处理')
  const grid = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '', blankrows: false, raw: true })
  return parseTableRows(grid, `${file.name}（${sheetName}）`)
}

export async function importVectorFiles(input: FileList | File[]): Promise<{ vector: RawVector; fileName: string }> {
  const files = Array.from(input)
  if (!files.length) throw new Error('请选择文件')
  const totalSize = files.reduce((sum, file) => sum + file.size, 0)
  if (totalSize > MAX_FILE_BYTES) throw new Error('所选文件总大小超过10MB，请分批处理')
  const primary = files.filter(file => /\.(geojson|json|csv|xlsx|xls|zip|shp)$/i.test(file.name))
  if (primary.length !== 1) throw new Error('请选择一个 GeoJSON、Excel、CSV 或 SHP 文件；SHP 可同时选择配套文件')
  const file = primary[0]
  const extension = file.name.split('.').pop()?.toLowerCase()
  let vector: RawVector
  if (extension === 'geojson' || extension === 'json') {
    if (files.length !== 1) throw new Error('GeoJSON 请单独选择一个文件')
    vector = validateCollection(JSON.parse((await file.text()).replace(/^\uFEFF/, '')), file.name)
  } else if (extension === 'csv' || extension === 'xlsx' || extension === 'xls') {
    if (files.length !== 1) throw new Error('表格文件请单独选择一个文件')
    vector = await importSpreadsheet(file)
  } else if (extension === 'zip') {
    if (files.length !== 1) throw new Error('SHP 压缩包请单独选择一个 ZIP 文件')
    vector = await importZip(file)
  } else if (extension === 'shp') {
    vector = await importLooseShapefile(files, file)
  } else {
    throw new Error('不支持的文件格式')
  }
  return { vector, fileName: file.name }
}
