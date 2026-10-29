import { describe,it,expect } from 'vitest'
import * as XLSX from 'xlsx'
import { readFileSync } from 'node:fs'
import { checkQuality } from '../src/services/quality'
import { transform,mappingProblems } from '../src/services/transform'
import { joinTables,splitTables } from '../src/services/joinTables'
import { makeWorkbook } from '../src/utils/excel'
import type { PlotCollection,FieldLevel,MappingSuggestion,TemplateDefinition,Dictionaries } from '../src/types'
const read=<T>(name:string):T=>JSON.parse(readFileSync(new URL(`../public/mock/${name}`,import.meta.url),'utf8'))
const plots=read<PlotCollection>('plots.geojson'),fields=read<FieldLevel[]>('field-levels.json'),template=read<TemplateDefinition>('template-columns.json'),dict=read<Dictionaries>('dictionaries.json')
function accepted(){return read<MappingSuggestion[]>('mapping-suggest.json').map(m=>({...m,selectedTarget:m.rawField==='DKBH'?null:m.recommendedTarget,status:m.rawField==='DKBH'?'rejected' as const:'confirmed' as const}))}
const rows=()=>transform(plots,accepted(),fields,template,{}).rows
describe('字段口径与映射',()=>{
 it('未确认平台必填的证件缺失只提示',()=>{const issues=checkQuality(rows(),fields,plots,dict);expect(issues.find(i=>i.rowId==='p2'&&i.fieldKey==='owner_id_no')?.level).toBe('info')})
 it('项目禁止空值也不能把平台未知必填升级为阻断',()=>{const fs=fields.map(f=>({...f,allowEmpty:false}));expect(checkQuality(rows(),fs,plots,dict).find(i=>i.rowId==='p2'&&i.fieldKey==='owner_id_no')?.level).toBe('info')})
 it('确权状态未知时条件必填只提示，人工确认后才阻断',()=>{const fs=fields.map(f=>f.key==='cert_plot_code'?{...f,platformRequired:'yes' as const}:f);const r=rows();expect(checkQuality(r,fs,plots,dict).find(i=>i.rowId==='p1'&&i.fieldKey==='cert_plot_code')?.level).toBe('info');r[0].is_confirmed=true;expect(checkQuality(r,fs,plots,dict).find(i=>i.rowId==='p1'&&i.fieldKey==='cert_plot_code')?.level).toBe('block')})
 it('已确认必填仅在条件满足时阻断',()=>{const fs=fields.map(f=>f.key==='owner_id_no'?{...f,platformRequired:'yes' as const,requiredWhen:{field:'use_l2',equals:'B03'}}:f);const q=checkQuality(rows(),fs,plots,dict);expect(q.find(i=>i.rowId==='p3'&&i.fieldKey==='owner_id_no')?.level).toBe('block');expect(q.some(i=>i.rowId==='p2'&&i.fieldKey==='owner_id_no'&&i.level==='block')).toBe(false)})
 it('低置信度不得自动生效；已确认映射不再待确认',()=>{expect(mappingProblems(read('mapping-suggest.json')).length).toBeGreaterThan(0);expect(mappingProblems(accepted())).toEqual([]);expect(transform(plots,read('mapping-suggest.json'),fields,template,{}).rows[0].area_mu).toBeNull()})
 it('同目标冲突必须处理',()=>{const ms=accepted();ms[1].status='confirmed';ms[1].selectedTarget='plot_code';expect(mappingProblems(ms)).toContain('plot_code 存在多个来源')})
 it('人工零值保留且来源可追溯',()=>{const r=transform(plots,accepted(),fields,template,{p1:{area_mu:0}});expect(r.rows[0].area_mu).toBe(0);expect(r.provenance.p1.area_mu.kind).toBe('manual')})
 it('修改默认值立即影响结果但不覆盖已有值',()=>{const fs=fields.map(f=>({...f,defaultable:true,defaultValue:'默认'}));const r=transform(plots,accepted(),fs,template,{});expect(r.rows[0].admin_code).toBe('默认');expect(r.rows[0].owner_name).toBe('演示人员甲')})
})
describe('三表和质检',()=>{
 it('三表正常按编码关联，重复编码不得静默覆盖',()=>{const t=splitTables(rows(),template);expect(joinTables(t).rows).toHaveLength(5);t.basic[1].plot_code=t.basic[0].plot_code;expect(joinTables(t).errors.length).toBeGreaterThan(0);expect(joinTables(t).rows).toHaveLength(0)})
 it('缺少关联表行明确报告',()=>{const t=splitTables(rows(),template);t.confirm.pop();expect(joinTables(t).errors.some(e=>e.includes('缺少关联表行'))).toBe(true)})
 it('非法几何阻断，已有值异常警告',()=>{const q=checkQuality(rows(),fields,plots,dict);expect(q.find(i=>i.rowId==='p4'&&i.ruleId==='geometry')?.level).toBe('block');expect(q.find(i=>i.rowId==='p5'&&i.ruleId==='dictionary')?.level).toBe('warn')})
})
describe('真实 Excel 序列化',()=>{
 it('单 Sheet 34 列顺序、换行表头、文本前导零、零值和空值',()=>{const r=rows();r[0].owner_id_no='001234';r[0].area_mu=0;const wb=makeWorkbook(r,template,'single');const roundtrip=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));const ws=roundtrip.Sheets[roundtrip.SheetNames[0]];const data=XLSX.utils.sheet_to_json<unknown[]>(ws,{header:1,defval:null});expect(data[1]).toEqual(template.columns.map(c=>c.header));expect(ws.L3.t).toBe('s');expect(ws.L3.v).toBe('001234');expect(ws.H3.v).toBe(0);expect(data[2][12]).toBe('')})
 it('三 Sheet 均保留关联键且不输出内部 rowId',()=>{const wb=makeWorkbook(rows(),template,'three');expect(wb.SheetNames).toHaveLength(3);for(const name of wb.SheetNames){const header=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name],{header:1})[0];expect(header).toContain('地块编码');expect(header).not.toContain('rowId')}})
 it('按稳定 rowId 提取失败行，不因重复编码多导出',()=>{const r=rows();r[1].plot_code=r[0].plot_code;const selected=r.filter(x=>x.rowId==='p2');const wb=makeWorkbook(selected,template,'single');expect(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]],{header:1})).toHaveLength(3)})
})
