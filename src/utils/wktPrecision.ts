import type { DataRow } from '../types'

/** Round only the WKT coordinate field; preserve identifiers and source geometry. */
export function roundWkt(value: unknown): unknown {
  if (typeof value !== 'string' || !/^\s*(?:SRID=\d+;\s*)?(?:MULTI)?POLYGON(?:\s+(?:Z|M|ZM))?\s*\(/i.test(value)) return value
  const start = value.indexOf('(')
  return value.slice(0, start) + value.slice(start).replace(/[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g, token => {
    const number = Number(token)
    if (!Number.isFinite(number)) return token
    const rounded = Number(number.toFixed(6))
    return Object.is(rounded, -0) ? '0' : String(rounded)
  })
}

export function roundWktRows(rows: DataRow[]): DataRow[] {
  return rows.map(row => ({ ...row, geom_wkt: roundWkt(row.geom_wkt) as DataRow[string] }))
}
