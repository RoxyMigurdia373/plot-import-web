import { it,expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { unzipSync } from 'fflate'
import * as XLSX from 'xlsx'
import { generatePair,pairRows } from '../src/services/simplePipeline'
import type { RawVector } from '../src/services/simplePipeline'
import type { TemplateDefinition } from '../src/types'
import { groupVillages,villageVector } from '../src/services/villageExport'
import { makeVillageArchive } from '../src/utils/villageExcel'
const template=JSON.parse(readFileSync(new URL('../public/mock/templates/village-boundary.json',import.meta.url),'utf8')) as TemplateDefinition
function setup(){
 const source:RawVector={type:'FeatureCollection',features:['001','001','002'].map((code,i)=>({type:'Feature',geometry:{type:'Polygon',coordinates:[[[i*2,0],[i*2+1,0],[i*2+1,1],[i*2,1],[i*2,0]]]},properties:{CODE:code,NAME:'同名村',GROUP:code,POP:0}}))}
 const vector=generatePair(source,{admin_code:'field:CODE',village_name:'field:NAME',population:'field:POP'},template)
 return {source,vector}
}
it('0325模板22列顺序完整，未映射值为空',()=>{const {vector}=setup();expect(template.columns).toHaveLength(22);expect(Object.keys(vector.geojson.features[0].properties)).toEqual(template.columns.map(c=>c.header));expect(vector.geojson.features[0].properties['统一社会信用代码']).toBeNull();expect(vector.geojson.features[0].properties['人口数']).toBe(0)})
it('同村多个要素同表，同名不同编码不合并',()=>{const {source,vector}=setup();const r=groupVillages(vector,source);expect(r.errors).toEqual([]);expect(r.groups).toHaveLength(2);expect(r.groups.map(g=>g.rows.length)).toEqual([2,1]);expect(r.groups[0].rows[0].admin_code).toBe('001');expect(r.groups[0].rows[0].population).toBe(0)})
it('未映射行政区划时可指定原始村标识，仅分组不回填模板',()=>{const {source}=setup();const vector=generatePair(source,{},template);const r=groupVillages(vector,source,'GROUP');expect(r.errors).toEqual([]);expect(r.groups).toHaveLength(2);expect(r.groups.every(g=>g.rows.every(row=>row.admin_code===null))).toBe(true);expect(Object.values(vector.geojson.features[0].properties).every(v=>v===null)).toBe(true)})
it('缺失村标识不丢行静默合并，提示对应要素',()=>{const {source,vector}=setup();vector.geojson.features[1].properties['行政区划编码']=null;const r=groupVillages(vector,source);expect(r.errors[0]).toContain('第 2 个要素');expect(r.groups.flatMap(g=>g.rows)).toHaveLength(2)})
it('同分组存在不同编码或不同村名时阻止错误合并',()=>{const {source,vector}=setup();for(const f of source.features)f.properties.GROUP='ONE';expect(groupVillages(vector,source,'GROUP').errors[0]).toContain('多个行政区划编码');vector.geojson.features[1].properties['村']='另一个村';expect(groupVillages(vector,source).errors[0]).toContain('不同村名')})
it('批量ZIP内每村一个独立XLSX，保留22列表头、前导零、空值和零值',()=>{const {source,vector}=setup();const groups=groupVillages(vector,source).groups;const zip=unzipSync(makeVillageArchive(groups,template));expect(Object.keys(zip)).toHaveLength(2);for(const g of groups){const bytes=zip[`${g.fileStem}.xlsx`];expect(bytes).toBeDefined();const wb=XLSX.read(bytes);expect(wb.SheetNames).toHaveLength(1);const ws=wb.Sheets[wb.SheetNames[0]];const data=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1});expect(data[0]).toEqual(template.columns.map(c=>c.header));expect(data.length).toBe(g.rows.length+1);expect(data[1][0]).toBe(g.key);expect(data[1][6]).toBe('');expect(data[1][10]).toBe(0)}})
it('每村矢量只含该村要素且保留原始几何',()=>{const {source,vector}=setup();const groups=groupVillages(vector,source).groups;const geo=villageVector(vector,groups[0]);expect(geo.features).toHaveLength(2);expect(geo.features[0].geometry).toEqual(source.features[0].geometry);expect(pairRows({...vector,geojson:geo})).toHaveLength(2)})
it('文件名替换非法路径字符并保持唯一，ZIP条目不含路径分隔符',()=>{const {source,vector}=setup();for(const f of vector.geojson.features)f.properties['村']='同/名:村?';const groups=groupVillages(vector,source).groups;expect(new Set(groups.map(g=>g.fileStem)).size).toBe(2);expect(groups.every(g=>!/[<>:"/\\|?*]/.test(g.fileStem))).toBe(true)})
