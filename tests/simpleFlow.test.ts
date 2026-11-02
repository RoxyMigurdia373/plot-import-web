import { describe,it,expect } from 'vitest'
import * as XLSX from 'xlsx'
import { parseVector,generatePair,pairRows,sourceFields,GEOMETRY_SOURCE } from '../src/services/simplePipeline'
import type { RawVector } from '../src/services/simplePipeline'
import { makeWorkbook } from '../src/utils/excel'
import type { TemplateDefinition } from '../src/types'
const square=(x=0,y=0)=>({type:'Feature' as const,geometry:{type:'Polygon' as const,coordinates:[[[x,y],[x+1,y],[x+1,y+1],[x,y+1],[x,y]]]},properties:{name:'甲',area:0,id:'001',empty:''}})
const collection=(...features:RawVector['features']):RawVector=>({type:'FeatureCollection',features})
describe('映射与双成果',()=>{
 it('原始属性字段取所有要素的并集',()=>{const a=square(),b=square(2);b.properties={...b.properties,late:1} as typeof b.properties;expect(sourceFields(parseVector(JSON.stringify(collection(a,b))))).toContain('late')})
 it('未映射编号和边界也留空，不应用任何默认值，几何保持不变',()=>{const source=collection(square());const template:TemplateDefinition={id:'test',version:'1',sheetName:'测试',headerRows:1,columns:[{key:'row_no',header:'编号',group:'basic',order:1,dataType:'number'},{key:'name',header:'名称',group:'basic',order:2,dataType:'string'},{key:'area_mu',header:'面积',group:'basic',order:3,dataType:'number'},{key:'geom_wkt',header:'边界',group:'basic',order:4,dataType:'string'}]};const v=generatePair(source,{name:'field:name',area_mu:'field:area'},template);expect(v.geojson.features[0].properties).toEqual({'编号':null,'名称':'甲','面积':0,'边界':null});expect(v.geojson.features[0].geometry).toEqual(source.features[0].geometry);const wb=makeWorkbook(pairRows(v),template,'single');expect(XLSX.utils.sheet_to_json(wb.Sheets['测试'],{header:1})).toEqual([['编号','名称','面积','边界'],['','甲',0,'']]);expect(generatePair(source,{geom_wkt:GEOMETRY_SOURCE},template).geojson.features[0].properties['边界']).toContain('POLYGON')})
 it('几何原样透传，不再做拓扑检查',()=>{const overlapping=collection(square(),square(.5));const template:TemplateDefinition={id:'t',version:'1',sheetName:'表',headerRows:1,columns:[{key:'name',header:'名称',group:'basic',order:1,dataType:'string'}]};const vector=generatePair(overlapping,{name:'field:name'},template);expect(vector.geojson.features).toHaveLength(2);expect(vector.geojson.features[1].geometry).toEqual(overlapping.features[1].geometry)})
 it('空几何原样保留，不支持的坐标系明确拒绝',()=>{const empty=parseVector(JSON.stringify(collection({type:'Feature',geometry:null,properties:{}})));expect(empty.features[0].geometry).toBeNull();expect(()=>parseVector(JSON.stringify({...collection(square()),crs:{properties:{name:'EPSG:3857'}}}))).toThrow('坐标系')})
 it('空文件、超过要素上限、错误属性不接受',()=>{expect(()=>parseVector('{"type":"FeatureCollection","features":[]}')).toThrow();expect(()=>parseVector(JSON.stringify({type:'FeatureCollection',features:Array.from({length:200001},()=>square())}))).toThrow('20 万个要素');expect(()=>parseVector(JSON.stringify(collection({...square(),properties:[] as unknown as Record<string,unknown>})))).toThrow('属性')})
})
