import type { DataRow, FieldGroup, TemplateDefinition } from '../types'
export function splitTables(rows: DataRow[], template: TemplateDefinition): Record<FieldGroup, DataRow[]> { return Object.fromEntries((['basic','confirm','ext'] as FieldGroup[]).map(group => [group, rows.map(row => { const out: DataRow = {rowId:row.rowId,plot_code:row.plot_code}; for (const c of template.columns.filter(c => c.group === group)) out[c.key] = row[c.key] ?? null; return out })])) as Record<FieldGroup, DataRow[]> }
export function joinTables(tables: Record<FieldGroup, DataRow[]>) {
 const errors: string[] = []
 for (const [group, rows] of Object.entries(tables)) { const keys = rows.map(r => r.plot_code); if (keys.some(k => !k)) errors.push(`${group} 缺少关联键`); if (new Set(keys).size !== keys.length) errors.push(`${group} 关联键重复`); for (const r of rows) if (!tables.basic.some(b => b.plot_code === r.plot_code)) errors.push(`${group} 孤立行 ${r.plot_code}`) }
 if (errors.length) return {rows:[] as DataRow[],errors}
 const rows = tables.basic.map(b => { const c = tables.confirm.find(r => r.plot_code === b.plot_code), e = tables.ext.find(r => r.plot_code === b.plot_code); if (!c || !e) errors.push(`${b.plot_code} 缺少关联表行`); return {...b,...c,...e,rowId:b.rowId} })
 return {rows,errors}
}
