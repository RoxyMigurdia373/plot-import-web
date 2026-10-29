import { it,expect } from 'vitest'
import { readFileSync } from 'node:fs'
import * as XLSX from 'xlsx'
import { standardizeVector,standardVectorRows,selectedTemplate } from '../src/services/standardVector'
import { makeWorkbook } from '../src/utils/excel'
import { transform } from '../src/services/transform'
import type { PlotCollection,TemplateDefinition,FieldLevel,MappingSuggestion } from '../src/types'
const read=<T>(name:string):T=>JSON.parse(readFileSync(new URL(`../public/mock/${name}`,import.meta.url),'utf8'))
function setup(){const source=read<PlotCollection>('plots.geojson'),template=read<TemplateDefinition>('template-columns.json'),fields=read<FieldLevel[]>('field-levels.json'),mappings=read<MappingSuggestion[]>('mapping-suggest.json').map(m=>({...m,selectedTarget:m.recommendedTarget,status:m.rawField==='DKBH'?'rejected' as const:'confirmed' as const}));const rows=transform(source,mappings,fields,template,{}).rows;return{source,rows,template}}
it('每个标准要素有完整中文模板表头，全部空字段保留为 null，几何保留',()=>{const {source,rows,template}=setup();const v=standardizeVector(source,rows,template,'v1');for(const f of v.geojson.features){expect(Object.keys(f.properties)).toEqual(template.columns.map(c=>c.header));expect(f.properties['合同代码（确权地块必填）']).toBeNull();expect(Object.keys(f.properties)).not.toContain('rowId')}expect(v.geojson.features[0].geometry).toEqual(source.features[0].geometry);expect(v.geojson.features[0].id).toBe('p1')})
it('标准结果是独立快照，修改原始矢量不改变导表内容',()=>{const {source,rows,template}=setup();const v=standardizeVector(source,rows,template,'v1');source.features[0].properties.MJ=999;rows[0].area_mu=999;expect(standardVectorRows(v)[0].area_mu).toBe(1.5);v.geojson.features[0].properties['实际面积/亩']=7;expect(standardVectorRows(v)[0].area_mu).toBe(7)})
it('只输出选中字段，全空列保留表头、空单元格和零值',()=>{const {source,rows,template}=setup();rows[0].area_mu=0;const v=standardizeVector(source,rows,template,'v1');const t=selectedTemplate(v,['contract_code','area_mu','plot_code']);const wb=makeWorkbook(standardVectorRows(v),t,'single');const data=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]],{header:1});expect(data[1]).toEqual(['地块编码','实际面积/亩','合同代码（确权地块必填）']);expect(data[2]).toEqual(['DEMO-001',0,'']);expect(v.geojson.features[0].properties).toHaveProperty('所有人证件号')})
it('不允许空字段选择或引用非标准字段',()=>{const {source,rows,template}=setup();const v=standardizeVector(source,rows,template,'v1');expect(()=>selectedTemplate(v,[])).toThrow();expect(()=>selectedTemplate(v,['TBBH'])).toThrow()})
