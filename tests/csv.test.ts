import { it,expect } from 'vitest'
import * as XLSX from 'xlsx'
import { unzipSync } from 'fflate'
import { readFileSync } from 'node:fs'
import { makeCSV } from '../src/utils/tableExport'
import { makeVillageArchive } from '../src/utils/villageExcel'
import type { TemplateDefinition,DataRow } from '../src/types'
const read=(name:string):TemplateDefinition=>JSON.parse(readFileSync(new URL(`../public/mock/${name}`,import.meta.url),'utf8'))
it.each(['template-columns.json','templates/land-classification.json','templates/crop-recognition.json','templates/village-boundary.json'])('%s CSV 保留所有字段且仅一行表头',name=>{
 const t=read(name);const r:DataRow={rowId:'r1',plot_code:null};const csv=makeCSV([r],t);expect(csv.charCodeAt(0)).toBe(0xfeff);const wb=XLSX.read(new TextEncoder().encode(csv),{type:'array',raw:true});const data=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]],{header:1,defval:'',blankrows:true});expect(data[0]).toEqual(t.columns.map(c=>c.header));expect(data[1]).toEqual(t.columns.map(()=>''));expect(csv.endsWith('\r\n')).toBe(true)
})
it('逗号、双引号、换行、WKT、前导零、零值和空值正确往返',()=>{
 const t=read('templates/village-boundary.json');const r:DataRow={rowId:'r1',plot_code:null,admin_code:'00123456789012345678',village_name:'甲村,"东片"\n第二行',geom_wkt:'POLYGON ((1 2,3 4,1 2))',population:0};const csv=makeCSV([r],t);expect(csv).toContain('"甲村,""东片""\n第二行"');const wb=XLSX.read(new TextEncoder().encode(csv),{type:'array',raw:true});const data=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});expect(data[1][0]).toBe(r.admin_code);expect(data[1][5]).toBe(r.village_name);expect(data[1][7]).toBe(r.geom_wkt);expect(data[1][10]).toBe('0');expect(data[1][6]).toBe('')
})
it('CSV ZIP 每村一个文件，各自保留完整表头与记录',()=>{
 const t=read('templates/village-boundary.json');const groups=['001','002'].map(key=>({key,name:key,fileStem:key,rows:[{rowId:key,plot_code:null,admin_code:key}],featureIds:[key]}));const zip=unzipSync(makeVillageArchive(groups,t,'csv'));expect(Object.keys(zip)).toEqual(['001.csv','002.csv']);for(const key of ['001','002']){expect([...zip[`${key}.csv`].slice(0,3)]).toEqual([239,187,191]);const wb=XLSX.read(zip[`${key}.csv`],{type:'array',raw:true});const data=XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[wb.SheetNames[0]],{header:1,defval:''});expect(data[0]).toEqual(t.columns.map(c=>c.header));expect(data[1][0]).toBe(key);expect(data.length).toBe(2)}
})
