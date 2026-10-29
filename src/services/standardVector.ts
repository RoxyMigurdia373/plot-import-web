import type { FeatureCollection, Geometry } from 'geojson'
import type { CellValue, DataRow, PlotCollection, TemplateDefinition } from '../types'
export interface StandardVector {
 template: TemplateDefinition
 generatedAt: string
 signature: string
 geojson: FeatureCollection<Geometry | null, Record<string, CellValue>>
}
export function standardizeVector(source: PlotCollection, rows: DataRow[], template: TemplateDefinition, signature: string): StandardVector {
 const geometries=new Map(source.features.map(f=>[f.properties.rowId,f.geometry]))
 return JSON.parse(JSON.stringify({template,signature,generatedAt:new Date().toISOString(),geojson:{type:'FeatureCollection',features:rows.map(row=>({type:'Feature',id:row.rowId,geometry:geometries.get(row.rowId)??null,properties:Object.fromEntries(template.columns.map(c=>[c.header,row[c.key]===''?null:row[c.key]??null]))}))}}))
}
/** 只读取处理后的矢量，不读取原始属性、映射或默认值。 */
export function standardVectorRows(vector:StandardVector):DataRow[]{
 return vector.geojson.features.map(f=>{
  const row:DataRow={rowId:String(f.id),plot_code:null}
  for(const c of vector.template.columns)row[c.key]=f.properties[c.header]??null
  return row
 })
}
export function selectedTemplate(vector:StandardVector,keys:string[]):TemplateDefinition{
 const selected=new Set(keys)
 const columns=vector.template.columns.filter(c=>selected.has(c.key))
 if(!columns.length)throw new Error('请至少选择一个导出字段')
 if(columns.length!==selected.size)throw new Error('所选字段不属于当前标准矢量')
 return {...vector.template,columns}
}
