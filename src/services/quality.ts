import type { DataRow, Dictionaries, FieldLevel, PlotCollection, QualityIssue, QualityLevel } from '../types'
import { isEmpty } from './transform'
export function validateGeometry(g: PlotCollection['features'][number]['geometry']): boolean {
 if (!g || (g.type !== 'Polygon' && g.type !== 'MultiPolygon')) return false
 const polygons = g.type === 'Polygon' ? [g.coordinates] : g.coordinates
 return polygons.length > 0 && polygons.every(p => p.length > 0 && p.every(r => r.length >= 4 && r.every(v => v.length >= 2 && Number.isFinite(v[0]) && Number.isFinite(v[1]) && Math.abs(v[0]) <= 180 && Math.abs(v[1]) <= 90) && r[0][0] === r.at(-1)![0] && r[0][1] === r.at(-1)![1] && Math.abs(r.slice(1).reduce((s,v,i) => s + r[i][0]*v[1]-v[0]*r[i][1],0)) > 1e-12))
}
export function checkQuality(rows: DataRow[], levels: FieldLevel[], plots: PlotCollection, dict: Dictionaries): QualityIssue[] {
 const issues: QualityIssue[] = []
 rows.forEach((row,i) => {
  const add = (ruleId: string, level: QualityLevel, type: string, desc: string, suggest: string, fieldKey?: string) => issues.push({id:`${row.rowId}:${ruleId}:${fieldKey || ''}`,rowId:row.rowId,row:i+1,plotCode:row.plot_code,fieldKey,ruleId,type,level,desc,suggest,status:'open'})
  if (isEmpty(row.plot_code)) add('key-missing','block','关联键缺失','转换结果缺少当前模板的地块标识','人工填写项目内唯一编码','plot_code')
  else if (rows.filter(r => r.plot_code === row.plot_code).length > 1) add('key-duplicate','block','地块编码重复','多个地块使用相同编码','修正编码后重新检查','plot_code')
  const feature = plots.features.find(f => f.properties.rowId === row.rowId)
  if (!validateGeometry(feature?.geometry || null)) add('geometry','block','几何无效','几何为空、未闭合、退化或坐标越界','在源矢量工具中修复后重导；原型不修复几何','geom_wkt')
  for (const field of levels) {
   if (field.key === 'plot_code' || field.key === 'geom_wkt') continue
   const applies = !field.requiredWhen || row[field.requiredWhen.field] === field.requiredWhen.equals
   if (isEmpty(row[field.key])) {
    if (field.platformRequired === 'yes' && applies) add('required','block','确认必填缺失',`${field.field} 已确认必填，当前为空`,'人工补充真实资料',field.key)
    else if (field.platformRequired === 'yes' && field.requiredWhen && isEmpty(row[field.requiredWhen.field])) add('condition-unknown','info','适用条件待确认',`${field.field} 的必填适用条件尚未确认`,'人工确认地块适用条件，当前不阻断',field.key)
    else if (field.platformRequired === 'unknown') add('unknown-required','info','必填待确认',`${field.field} 为空，平台要求待确认`,'可人工补充；当前不阻断',field.key)
    else if (!field.allowEmpty && applies) add('project-empty','warn','项目空值提醒',`${field.field} 不符合项目允许空配置`,'人工补充或调整项目配置',field.key)
   }
  }
  if (!isEmpty(row.owner_id_no) && !/^\d{17}[\dXx]$/.test(String(row.owner_id_no))) add('id-format','warn','证件格式异常','已有证件号不符合演示用18位格式检查','核对原始证件；不自动修补','owner_id_no')
  if (!isEmpty(row.use_l2) && !dict.use_l2.includes(String(row.use_l2))) add('dictionary','warn','字典值异常','分类字段不在当前功能的演示字典中','核对用途映射及平台字典','use_l2')
  if (!isEmpty(row.area_mu) && (typeof row.area_mu !== 'number' || row.area_mu < 0)) add('area-type','warn','面积格式异常','面积应为非负数值','核对面积单位及数值','area_mu')
  const reference = feature?.properties.mock_area_reference_mu
  if (typeof reference === 'number' && reference > 0 && typeof row.area_mu === 'number' && Math.abs(row.area_mu-reference)/reference > dict.areaTolerance) add('area-difference','warn','面积差异','面积与预设 mock 参考面积差异超过20%','核对单位；原型未进行真实测地面积计算','area_mu')
 }); return issues
}
