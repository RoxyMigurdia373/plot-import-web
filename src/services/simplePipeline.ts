import type { FeatureCollection,Geometry } from 'geojson'
import type { DataRow,TemplateDefinition } from '../types'
import { toWkt } from './transform'
import type { StandardVector } from './standardVector'
export type RawVector=FeatureCollection<Geometry|null,Record<string,unknown>>
export type FieldMapping=Record<string,string|null>
export const GEOMETRY_SOURCE='@geometry'
export function parseVector(text:string):RawVector{
 const data=JSON.parse(text.replace(/^\uFEFF/,''))
 if(data.crs && !/4326|CRS84/.test(JSON.stringify(data.crs)))throw new Error('仅支持 WGS84 经纬度 GeoJSON，请先转换坐标系')
 if(data.type!=='FeatureCollection'||!Array.isArray(data.features)||!data.features.length)throw new Error('请选择非空 GeoJSON FeatureCollection')
 if(data.features.length>250)throw new Error('本地原型最多检查250个要素，请分批处理')
 for(const f of data.features){if(f?.type!=='Feature'||!('geometry' in f)||f.properties!==null&&(typeof f.properties!=='object'||Array.isArray(f.properties)))throw new Error('要素结构或属性格式不正确');f.properties=f.properties||{}}
 return data
}
export function sourceFields(source:RawVector):string[]{return [...new Set(source.features.flatMap(f=>Object.keys(f.properties)))]}
export function generatePair(source:RawVector,mapping:FieldMapping,template:TemplateDefinition):StandardVector{
 const features=source.features.map((f,i)=>({type:'Feature' as const,id:`source-${i+1}`,geometry:f.geometry,properties:Object.fromEntries(template.columns.map(c=>{
  const selected=mapping[c.key];const value=selected===GEOMETRY_SOURCE?toWkt(f.geometry):selected?f.properties[selected.startsWith('field:')?selected.slice(6):selected]:null
  return [c.header,value===undefined||value===null||value===''?null:typeof value==='object'?JSON.stringify(value):value]
 }))}))
 return JSON.parse(JSON.stringify({template,signature:JSON.stringify(mapping),generatedAt:new Date().toISOString(),geojson:{type:'FeatureCollection',features}}))
}
export function pairRows(vector:StandardVector):DataRow[]{return vector.geojson.features.map(f=>({rowId:String(f.id),plot_code:null,...Object.fromEntries(vector.template.columns.map(c=>[c.key,f.properties[c.header]??null]))}))}
