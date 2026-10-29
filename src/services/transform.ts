import type { DataRow, FieldLevel, MappingSuggestion, PlotCollection, TemplateDefinition, FieldProvenance } from '../types'
export const isEmpty = (v: unknown) => v === null || v === undefined || v === ''
export function activeTarget(m: MappingSuggestion): string | null { if (m.status === 'rejected') return null; if (m.status === 'confirmed') return m.selectedTarget; return m.needConfirm || m.confidence < .8 ? null : m.recommendedTarget }
export function mappingProblems(mappings: MappingSuggestion[]): string[] { const pending = mappings.filter(m => (m.needConfirm || m.confidence < .8) && m.status === 'auto').map(m => `${m.rawField} 待人工确认`); const targets = mappings.map(activeTarget).filter(Boolean); for (const t of new Set(targets)) if (targets.filter(x => x === t).length > 1) pending.push(`${t} 存在多个来源`); return pending }
export function toWkt(geometry: PlotCollection['features'][number]['geometry']): string | null { if (!geometry) return null; if (geometry.type === 'Polygon') return `POLYGON (${geometry.coordinates.map(r => '(' + r.map(p => p.join(' ')).join(', ') + ')').join(', ')})`; if (geometry.type === 'MultiPolygon') return `MULTIPOLYGON (${geometry.coordinates.map(p => '(' + p.map(r => '(' + r.map(v => v.join(' ')).join(', ') + ')').join(', ') + ')').join(', ')})`; return null }
export function transform(plots: PlotCollection, mappings: MappingSuggestion[], levels: FieldLevel[], template: TemplateDefinition, overrides: Record<string, Record<string, unknown>>) {
  const provenance: Record<string, Record<string, FieldProvenance>> = {}
  const rows: DataRow[] = plots.features.map((feature, i) => {
    const row: DataRow = {rowId: feature.properties.rowId, plot_code: null, is_confirmed: null}; const sources: Record<string, FieldProvenance> = {}
    for (const col of template.columns) row[col.key] = null
    for (const m of mappings) { const target = activeTarget(m); if (target && !isEmpty(feature.properties[m.rawField])) { row[target] = feature.properties[m.rawField] as DataRow[string]; sources[target] = {kind:'raw',sourceField:m.rawField} } }
    row.row_no = i + 1; row.geom_wkt = toWkt(feature.geometry); sources.row_no = {kind:'derived'}; sources.geom_wkt = {kind:'derived',explanation:'由 mock GeoJSON 序列化为 WKT'}
    for (const level of levels) if (isEmpty(row[level.key]) && level.defaultable && !isEmpty(level.defaultValue)) { row[level.key] = level.defaultValue; sources[level.key] = {kind:'default'} }
    for (const [key, value] of Object.entries(overrides[row.rowId] || {})) { row[key] = value as DataRow[string]; sources[key] = {kind:'manual'} }
    provenance[row.rowId] = sources; return row
  }); return {rows, provenance}
}
