import type { DataRow,TemplateDefinition } from '../types'
import { exportRows } from './excel'
export type TableFormat='xlsx'|'csv'
/** CSV 使用单行完整字段表头，不包含 Excel 装饰分组行。 */
export function makeCSV(rows:DataRow[],template:TemplateDefinition):string{
 const escape=(value:unknown)=>{
  const text=value===null||value===undefined?'':String(value)
  return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text
 }
 return '\uFEFF'+[template.columns.map(c=>c.header),...rows.map(r=>template.columns.map(c=>r[c.key]))].map(row=>row.map(escape).join(',')).join('\r\n')+'\r\n'
}
export function exportTable(rows:DataRow[],template:TemplateDefinition,format:TableFormat,fileStem:string){
 if(format==='xlsx'){exportRows(rows,template,'single',`${fileStem}.xlsx`);return}
 const blob=new Blob([makeCSV(rows,template)],{type:'text/csv;charset=utf-8'})
 const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`${fileStem}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000)
}
