import kinks from '@turf/kinks'
import booleanValid from '@turf/boolean-valid'
import intersect from '@turf/intersect'
import area from '@turf/area'
import bbox from '@turf/bbox'
import type { Feature,Polygon,MultiPolygon,Position } from 'geojson'
import type { RawVector } from './simplePipeline'
export interface TopologyIssue { rows:number[];level:'block'|'warn';type:string;message:string }
export interface TopologyReport { issues:TopologyIssue[]; checked:number; pairs:number }
export function checkTopology(source:RawVector):TopologyReport{
 const issues:TopologyIssue[]=[],valid:{feature:Feature<Polygon|MultiPolygon>;row:number;box:number[]}[]=[];let pairs=0
 const add=(rows:number[],level:'block'|'warn',type:string,message:string)=>issues.push({rows,level,type,message})
 source.features.forEach((f,index)=>{
  const row=index+1,g=f.geometry
  if(!g||!['Polygon','MultiPolygon'].includes(g.type)){add([row],'block','非面或空几何','需要 Polygon / MultiPolygon 面要素');return}
  try{
   const geom=g as Polygon|MultiPolygon,polygons=geom.type==='Polygon'?[geom.coordinates]:geom.coordinates
   if(!polygons.length||polygons.some(p=>!Array.isArray(p)||!p.length||p.some(r=>!Array.isArray(r)||r.length<4||r.some(v=>!Array.isArray(v)||v.length<2||!v.every(Number.isFinite)||Math.abs(v[0])>180||Math.abs(v[1])>90)))){add([row],'block','坐标或环结构无效','检查坐标范围、点数及坐标系；仅支持WGS84经纬度');return}
   const rings=polygons.flat();if(rings.some(r=>r[0].length!==r.at(-1)!.length||r[0].some((n,i)=>n!==r.at(-1)![i]))){add([row],'block','环未闭合','首尾坐标必须一致；不自动修改原始几何');return}
   const feature=f as Feature<Polygon|MultiPolygon>
   if(kinks(feature).features.length){add([row],'block','边界自相交','边界存在交叉，请修复源矢量');return}
   const signed=(r:Position[])=>Math.abs(r.slice(1).reduce((s,v,i)=>s+r[i][0]*v[1]-v[0]*r[i][1],0))
   if(rings.some(r=>signed(r)<1e-14)||!booleanValid(feature)){add([row],'block','无效面拓扑','退化面、重复点或内外环关系不合法');return}
   valid.push({feature,row,box:bbox(feature)})
  }catch{add([row],'block','几何检查失败','几何结构无法可靠检查，请核对源文件')}
 })
 for(let i=0;i<valid.length;i++)for(let j=i+1;j<valid.length;j++){
  const a=valid[i],b=valid[j];if(a.box[2]<b.box[0]||b.box[2]<a.box[0]||a.box[3]<b.box[1]||b.box[3]<a.box[1])continue
  pairs++
  try{const overlap=intersect({type:'FeatureCollection',features:[a.feature,b.feature]});if(!overlap)continue;const size=area(overlap);if(size<=.0001)continue;const aa=area(a.feature),ba=area(b.feature),duplicate=Math.abs(size-aa)<Math.max(.0001,aa*1e-9)&&Math.abs(size-ba)<Math.max(.0001,ba*1e-9);add([a.row,b.row],'warn',duplicate?'重复面':'地块重叠',`${duplicate?'两条记录边界重合':'两个地块内部有面积重叠'}，请人工核对；相邻共边不报重叠`)}catch{add([a.row,b.row],'block','叠加检查失败','无法可靠判断这对地块的关系，请先修复源数据')}
 }
 return {issues,checked:source.features.length,pairs}
}
