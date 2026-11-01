import type { FeatureCollection,Geometry } from 'geojson'
import type { DataRow,TemplateDefinition } from '../types'
import { toWkt } from './transform'
import { formatCount, limits } from './limits'
import type { StandardVector } from './standardVector'
export type RawVector=FeatureCollection<Geometry|null,Record<string,unknown>>
export type FieldMapping=Record<string,string|null>
export const GEOMETRY_SOURCE='@geometry'
/** 固定值前缀：value:任意文本，生成时原样写入模板列。 */
export const VALUE_PREFIX='value:'
export function isConstant(selected:string|null|undefined):boolean{return typeof selected==='string'&&selected.startsWith(VALUE_PREFIX)}
export function constantValue(selected:string|null|undefined):string{return isConstant(selected)?String(selected).slice(VALUE_PREFIX.length):''}
export function mappingSource(selected:string|null|undefined):string|null{
 if(!selected)return null
 if(selected===GEOMETRY_SOURCE)return '几何转为 WKT'
 if(isConstant(selected))return `固定值：${constantValue(selected)||'（空）'}`
 return selected.startsWith('field:')?selected.slice(6):selected
}
export function parseVector(text:string):RawVector{
 const data=JSON.parse(text.replace(/^\uFEFF/,''))
 if(data.crs && !/4326|CRS84/.test(JSON.stringify(data.crs)))throw new Error('仅支持 WGS84 经纬度 GeoJSON，请先转换坐标系')
 if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||!data.features.length)throw new Error('请选择非空 GeoJSON FeatureCollection')
 if(data.features.length>limits.maxFeatures)throw new Error(`本地处理上限为 ${formatCount(limits.maxFeatures)}个要素，请分批处理`)
 for(const f of data.features){if(f?.type!=='Feature'||!('geometry' in f)||f.properties!==null&&(typeof f.properties!=='object'||Array.isArray(f.properties)))throw new Error('要素结构或属性格式不正确');f.properties=f.properties||{}}
 return data
}
export function sourceFields(source:RawVector):string[]{return [...new Set(source.features.flatMap(f=>Object.keys(f.properties)))]}
export function generatePair(source:RawVector,mapping:FieldMapping,template:TemplateDefinition):StandardVector{
 const features=source.features.map((f,i)=>({type:'Feature' as const,id:`source-${i+1}`,geometry:f.geometry,properties:Object.fromEntries(template.columns.map(c=>{
  const selected=mapping[c.key]
  const value=selected===GEOMETRY_SOURCE?toWkt(f.geometry):isConstant(selected)?constantValue(selected):selected?f.properties[selected.startsWith('field:')?selected.slice(6):selected]:null
  return [c.header,value===undefined||value===null||value===''?null:typeof value==='object'?JSON.stringify(value):value]
 }))}))
 return JSON.parse(JSON.stringify({template,signature:JSON.stringify(mapping),generatedAt:new Date().toISOString(),geojson:{type:'FeatureCollection',features}}))
}
export function pairRows(vector:StandardVector):DataRow[]{return vector.geojson.features.map(f=>({rowId:String(f.id),plot_code:null,...Object.fromEntries(vector.template.columns.map(c=>[c.key,f.properties[c.header]??null]))}))}


