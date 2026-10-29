import type { DataRow } from '../types'
import type { StandardVector } from './standardVector'
import type { RawVector } from './simplePipeline'
import { pairRows } from './simplePipeline'

export interface VillageGroup {
 key:string
 name:string
 fileStem:string
 rows:DataRow[]
 featureIds:string[]
}
export interface VillageGrouping { groups:VillageGroup[]; errors:string[] }
const text=(value:unknown)=>typeof value==='string'||typeof value==='number'?String(value).trim():''
const safeName=(value:string)=>value.replace(/[<>:"/\\|?*\x00-\x1f]/g,'_').replace(/[. ]+$/g,'').slice(0,55)||'未命名村'

/** 分组依据仅用于拆分文件，不回填任何未映射的模板字段。 */
export function groupVillages(vector:StandardVector,source:RawVector,groupField=''):VillageGrouping{
 const groups=new Map<string,VillageGroup>(),errors:string[]=[]
 pairRows(vector).forEach((row,i)=>{
  const key=text(groupField?source.features[i]?.properties[groupField]:row.admin_code)
  if(!key){errors.push(`第 ${i+1} 个要素缺少有效村标识，请映射行政区划编码或选择有值的原始村标识字段`);return}
  let group=groups.get(key)
  if(!group){group={key,name:text(row.village_name)||key,fileStem:'',rows:[],featureIds:[]};groups.set(key,group)}
  group.rows.push(row);group.featureIds.push(row.rowId)
 })
 const result=[...groups.values()]
 result.forEach((g,i)=>{
  const codes=new Set(g.rows.map(r=>text(r.admin_code)).filter(Boolean)),names=new Set(g.rows.map(r=>text(r.village_name)).filter(Boolean))
  if(codes.size>1)errors.push(`村标识“${g.key}”对应多个行政区划编码，请选择唯一的村标识，避免合并不同村`)
  if(names.size>1)errors.push(`村标识“${g.key}”对应不同村名，请核对源字段或分组依据`)
  g.name=[...names][0]||g.key
  g.fileStem=`${String(i+1).padStart(3,'0')}_${safeName(g.name)}_${safeName(g.key)}_村界导入`
 })
 return {groups:result,errors}
}
export function villageVector(vector:StandardVector,group:VillageGroup){
 const ids=new Set(group.featureIds)
 return {...vector.geojson,features:vector.geojson.features.filter(f=>ids.has(String(f.id)))}
}
