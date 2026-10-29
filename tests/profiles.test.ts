import { describe,it,expect,beforeEach,vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { createPinia,setActivePinia } from 'pinia'
import * as XLSX from 'xlsx'
import { functions } from '../src/services/profile'
import { useTaskStore } from '../src/stores/taskStore'
import { useFieldLevelStore } from '../src/stores/fieldLevelStore'
import { useMappingStore } from '../src/stores/mappingStore'
import { useResultStore } from '../src/stores/resultStore'
import { makeWorkbook } from '../src/utils/excel'
const fixture=(name:string)=>JSON.parse(readFileSync(new URL(`../public/mock/${name}`,import.meta.url),'utf8'))
beforeEach(()=>{setActivePinia(createPinia());const data=new Map<string,string>();vi.stubGlobal('localStorage',{getItem:(k:string)=>data.get(k)||null,setItem:(k:string,v:string)=>data.set(k,v)});vi.stubGlobal('fetch',async(url:string)=>({ok:true,json:async()=>fixture(url.split('mock/')[1])}))})
async function activate(id:string){const task=useTaskStore();task.activeId=id;await useFieldLevelStore().load();await useMappingStore().load();useResultStore().load()}
function acceptAll(){const m=useMappingStore();for(const s of m.suggestions)m.update(s.id,{selectedTarget:s.recommendedTarget,status:s.rawField==='DKBH'?'rejected':'confirmed'})}
describe('共享矢量，三个独立处理功能',()=>{
 it.each(functions.filter(f=>f.id!=='village-boundary').map((f,i)=>[f.id,[34,12,8][i]] as const))('%s 使用自己的列、映射和表头行数',async(id,count)=>{
  const task=useTaskStore();await task.load();await activate(id);acceptAll();const r=useResultStore();expect(useMappingStore().problems).toEqual([]);expect(task.template!.columns).toHaveLength(count);expect(r.rows).toHaveLength(5);expect(r.joined.errors).toEqual([])
  const wb=makeWorkbook(r.joined.rows,task.template!,'single');const data=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]],{header:1});expect(data[task.template!.headerRows-1]).toEqual(task.template!.columns.map(c=>c.header));expect(data.length).toBe(5+task.template!.headerRows)
  expect(useMappingStore().suggestions.every(m=>task.template!.columns.some(c=>c.key===m.recommendedTarget))).toBe(true)
 })
 it('字段默认、映射、人工值和回执互相隔离，切换后恢复',async()=>{
  const task=useTaskStore();await task.load();await activate('full-plot');const f=useFieldLevelStore(),m=useMappingStore(),r=useResultStore();f.update('admin_code',{defaultValue:'FULL-ONLY'});acceptAll();r.edit('p1','area_mu',9);r.generateVector();await r.simulate();const receipt=r.upload!.id
  await activate('land-classification');expect(f.levels.find(f=>f.key==='admin_code')!.defaultValue).toBe('DEMO-VILLAGE');expect(m.problems.length).toBeGreaterThan(0);expect(r.upload).toBeNull();expect(r.rows[0].area_mu).toBeNull();acceptAll();r.edit('p1','area_mu',3)
  await activate('crop-recognition');expect(r.rows[0].area_mu).toBeNull();expect(m.problems.length).toBeGreaterThan(0)
  await activate('full-plot');expect(f.levels.find(f=>f.key==='admin_code')!.defaultValue).toBe('FULL-ONLY');expect(m.problems).toEqual([]);expect(r.rows[0].area_mu).toBe(9);expect(r.upload!.id).toBe(receipt)
  await activate('land-classification');expect(r.rows[0].area_mu).toBe(3);expect(task.plots.features[0].properties.MJ).toBe(1.5)
 })
 it('重新创建 store 后恢复当前模板配置，不恢复别的模板配置',async()=>{
  await useTaskStore().load();await activate('crop-recognition');useFieldLevelStore().update('village_name',{defaultValue:'作物功能默认村'});acceptAll();setActivePinia(createPinia());await useTaskStore().load();await activate('crop-recognition');expect(useFieldLevelStore().levels.find(f=>f.key==='village_name')!.defaultValue).toBe('作物功能默认村');expect(useMappingStore().problems).toEqual([]);await activate('full-plot');expect(useMappingStore().problems.length).toBeGreaterThan(0)
 })
 it('模拟上传等待期间切换功能，回执仍归属原功能',async()=>{
  await useTaskStore().load();await activate('full-plot');acceptAll();const r=useResultStore();let release!:()=>void;vi.stubGlobal('fetch',()=>new Promise(resolve=>{release=()=>resolve({ok:true,json:async()=>({})})}));r.generateVector();const pending=r.simulate();await activate('crop-recognition');release();await pending;expect(r.upload).toBeNull();await activate('full-plot');expect(r.upload?.total).toBe(5);expect(r.upload?.snapshot[0].use_l2).toBe('A01')
 })
 it('修改映射或补充值后标准矢量失效，重新生成才能恢复导出',async()=>{
  await useTaskStore().load();await activate('full-plot');acceptAll();const r=useResultStore();r.generateVector();expect(r.vectorStale).toBe(false);r.edit('p1','area_mu',0);expect(r.vectorStale).toBe(true);expect(r.standardRows[0].area_mu).toBe(1.5);await expect(r.simulate()).rejects.toThrow('标准矢量');r.generateVector();expect(r.vectorStale).toBe(false);expect(r.standardRows[0].area_mu).toBe(0);await activate('crop-recognition');expect(r.standardVector).toBeNull();await activate('full-plot');expect(r.standardRows[0].area_mu).toBe(0)
 })
})
