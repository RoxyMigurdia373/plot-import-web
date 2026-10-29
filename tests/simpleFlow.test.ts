import { describe,it,expect } from 'vitest'
import * as XLSX from 'xlsx'
import { checkTopology } from '../src/services/topology'
import { parseVector,generatePair,pairRows,sourceFields,GEOMETRY_SOURCE } from '../src/services/simplePipeline'
import type { RawVector } from '../src/services/simplePipeline'
import { makeWorkbook } from '../src/utils/excel'
import type { TemplateDefinition } from '../src/types'
const square=(x=0,y=0)=>({type:'Feature' as const,geometry:{type:'Polygon' as const,coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]},properties:{name:'甲',area:0,id:'001',empty:''}})
const collection=(...features:RawVector['features']):RawVector=>({type:'FeatureCollection',features})
describe('映射 + 拓扑 + 双成果',()=>{
 it('原始属性字段取所有要素的并集',()=>{const a=square(),b=square(2);b.properties={...b.properties,late:1} as typeof b.properties;expect(sourceFields(parseVector(JSON.stringify(collection(a,b))))).toContain('late')})
 it('未映射编号和边界也留空，不应用任何默认值，几何保持不变',()=>{const source=collection(square());const template:TemplateDefinition={id:'test',version:'1',sheetName:'测试',headerRows:1,columns:[{key:'row_no',header:'编号',group:'basic',order:1,dataType:'number'},{key:'name',header:'名称',group:'basic',order:2,dataType:'string'},{key:'area_mu',header:'面积',group:'basic',order:3,dataType:'number'},{key:'geom_wkt',header:'边界',group:'basic',order:4,dataType:'string'}]};const v=generatePair(source,{name:'field:name',area_mu:'field:area'},template);expect(v.geojson.features[0].properties).toEqual({'编号':null,'名称':'甲','面积':0,'边界':null});expect(v.geojson.features[0].geometry).toEqual(source.features[0].geometry);const wb=makeWorkbook(pairRows(v),template,'single');expect(XLSX.utils.sheet_to_json(wb.Sheets['测试'],{header:1})).toEqual([['编号','名称','面积','边界'],['','甲',0,'']]);expect(generatePair(source,{geom_wkt:GEOMETRY_SOURCE},template).geojson.features[0].properties['边界']).toContain('POLYGON')})
 it('合法相邻共边不报重叠',()=>{expect(checkTopology(collection(square(),square(1))).issues).toEqual([])})
 it('未闭合、自相交、退化、坐标越界均阻断',()=>{
  const open=square();open.geometry.coordinates[0].pop();expect(checkTopology(collection(open)).issues[0].type).toBe('环未闭合')
  const cross=square();cross.geometry.coordinates=[[[0,0],[1,1],[0,1],[1,0],[0,0]]];expect(checkTopology(collection(cross)).issues[0].type).toBe('边界自相交')
  const zero=square();zero.geometry.coordinates=[[[0,0],[1,0],[2,0],[0,0]]];expect(checkTopology(collection(zero)).issues[0].level).toBe('block')
  expect(checkTopology(collection(square(200))).issues[0].level).toBe('block')
 })
 it('重叠、包含及重复面会提示，不会当成共边',()=>{expect(checkTopology(collection(square(),square(.5))).issues[0].type).toBe('地块重叠');expect(checkTopology(collection(square(),square())).issues[0].type).toBe('重复面');const inside=square();inside.geometry.coordinates=[[[.1,.1],[.5,.1],[.5,.5],[.1,.5],[.1,.1]]];expect(checkTopology(collection(square(),inside)).issues[0].type).toBe('地块重叠')})
 it('空几何和不支持的坐标系明确拒绝或阻断',()=>{expect(checkTopology(collection({type:'Feature',geometry:null,properties:{}})).issues[0].level).toBe('block');expect(()=>parseVector(JSON.stringify({...collection(square()),crs:{properties:{name:'EPSG:3857'}}}))).toThrow('坐标系')})
 it('空文件、超过要素上限、错误属性不接受',()=>{expect(()=>parseVector('{"type":"FeatureCollection","features":[]}')).toThrow();expect(()=>parseVector(JSON.stringify(collection(...Array.from({length:251},()=>square()))))).toThrow('250');expect(()=>parseVector(JSON.stringify(collection({...square(),properties:[] as unknown as Record<string,unknown>})))).toThrow('属性')})
})
