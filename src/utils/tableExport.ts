import { utils as codepages } from 'xlsx/dist/cpexcel.full.mjs'
import type { DataRow,TemplateDefinition } from '../types'
import { exportRows } from './excel'
export type TableFormat='xlsx'|'csv'
export type CSVEncoding='utf8'|'gbk'
/** CSV 使用单行完整字段表头，不包含 Excel 装饰分组行。 */
export function makeCSV(rows:DataRow[],template:TemplateDefinition):string{
 const escape=(value:unknown)=>{
  const text=value===null||value===undefined?'':String(value)
  return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text
 }
 return '\uFEFF'+[template.columns.map(c=>c.header),...rows.map(r=>template.columns.map(c=>r[c.key]))].map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n'
}
export function makeCSVBytes(rows:DataRow[],template:TemplateDefinition,encoding:CSVEncoding='utf8'):Uint8Array{
 const csv=makeCSV(rows,template)
 if(encoding==='utf8')return new TextEncoder().encode(csv)
 const text=csv.slice(1)
 const bytes=new Uint8Array(codepages.encode(936,text))
 if(codepages.decode(936,bytes)!==text)throw new Error('内容包含 GBK 无法表示的字符，请选择 UTF-8 BOM 导出，避免文字丢失。')
 return bytes
}
export function exportTable(rows:DataRow[],template:TemplateDefinition,format:TableFormat,fileStem:string,encoding:CSVEncoding='utf8'){
 if(format==='xlsx'){exportRows(rows,template,'single',`${fileStem}.xlsx`);return}
 const blob=new Blob([new Uint8Array(makeCSVBytes(rows,template,encoding)).buffer],{type:`text/csv;charset=${encoding==='gbk'?'gbk':'utf-8'}`})
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${fileStem}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
