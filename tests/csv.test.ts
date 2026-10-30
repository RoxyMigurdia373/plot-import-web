import { it,expect } from 'vitest'
import * as XLSX from 'xlsx'
import { unzipSync } from 'fflate'
import { readFileSync } from 'node:fs'
import { makeCSV,makeCSVBytes } from '../src/utils/tableExport'
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

it('GBK 实际字节无 BOM，中文、引号、空值与前导零保留，村表 ZIP 使用相同编码',()=>{
 const t=read('templates/village-boundary.json');const row:DataRow={rowId:'r1',plot_code:null,admin_code:'001',village_name:'福坪村,"东片"\n第二行'}
 const bytes=makeCSVBytes([row],t,'gbk')
 expect([...bytes.slice(0,2)]).toEqual([0xd0,0xd0]) // 行政区划编码：行 = D0 D0
 expect(new TextDecoder('gbk').decode(bytes)).toBe(makeCSV([row],t).slice(1))
 const archive=unzipSync(makeVillageArchive([{key:'001',name:'福坪村',fileStem:'福坪村',rows:[row],featureIds:['r1']}],t,'csv','gbk'))
 expect(archive['福坪村.csv']).toEqual(bytes)
 expect(makeCSVBytes([row],t)).toEqual(new TextEncoder().encode(makeCSV([row],t)))
})
it('GBK 不静默替换无法编码的字符',()=>{
 const t=read('templates/village-boundary.json')
 expect(()=>makeCSVBytes([{rowId:'r1',plot_code:null,village_name:'村😀'}],t,'gbk')).toThrow('GBK 无法表示')
})
