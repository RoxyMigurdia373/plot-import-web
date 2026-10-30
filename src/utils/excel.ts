import * as XLSX from 'xlsx'
import type { DataRow, TemplateDefinition, QualityIssue } from '../types'
import { splitTables } from '../services/joinTables'
export const EXCEL_CELL_TEXT_LIMIT=32767
export interface ExcelTextOverflow {row:number;field:string;length:number}
export function findExcelTextOverflows(rows:DataRow[],columns:TemplateDefinition['columns']):ExcelTextOverflow[]{
 const overflows:ExcelTextOverflow[]=[]
 rows.forEach((row,index)=>columns.forEach(column=>{
  const value=row[column.key]
  if(typeof value==='string'&&value.length>EXCEL_CELL_TEXT_LIMIT)overflows.push({row:index+1,field:column.header,length:value.length})
 }))
 return overflows
}
export function assertExcelTextWithinLimit(rows:DataRow[],columns:TemplateDefinition['columns']):void{
 const overflows=findExcelTextOverflows(rows,columns)
 if(!overflows.length)return
 const max=Math.max(...overflows.map(item=>item.length))
 const records=[...new Set(overflows.map(item=>item.row))]
 const examples=records.slice(0,5).join('、')+(records.length>5?'…':'')
 throw new Error(`Excel 单元格最多容纳 ${EXCEL_CELL_TEXT_LIMIT} 个字符；${records.length} 条记录的“${overflows[0].field}”超限（第 ${examples} 条，最长 ${max.toLocaleString()} 字符）。为保留完整坐标，请改导出 CSV。`)
}
export function makeWorkbook(rows: DataRow[], template: TemplateDefinition, mode: 'single' | 'three') {
 assertExcelTextWithinLimit(rows,template.columns)
 const wb = XLSX.utils.book_new()
 const add = (name: string, data: DataRow[], columns: TemplateDefinition['columns'], grouped: boolean) => {
  const headers = columns.map(c => c.header)
  const groups = columns.map((c,i) => i === 0 || c.group !== columns[i-1].group ? ({basic:'基本信息',confirm:'确权信息',ext:'扩展信息'}[c.group]) : '')
  const body = data.map(r => columns.map(c => { const v = r[c.key]; return v === null || v === undefined ? '' : c.dataType === 'string' ? String(v) : v }))
  const ws = XLSX.utils.aoa_to_sheet([...(grouped ? [groups] : []),headers,...body]); ws['!cols'] = columns.map(c => ({wch:c.key === 'geom_wkt' ? 46 : 22}))
  if (grouped) { ws['!merges'] = []; let start=0; for(let i=1;i<=columns.length;i++) if(i===columns.length || columns[i].group!==columns[start].group){ if(i-start>1) ws['!merges'].push({s:{r:0,c:start},e:{r:0,c:i-1}}); start=i } }
  XLSX.utils.book_append_sheet(wb,ws,name)
 }
 if(mode==='single') add(template.sheetName,rows,template.columns,template.headerRows===2)
 else { const tables = splitTables(rows,template); for(const group of ['basic','confirm','ext'] as const){ const cols=template.columns.filter(c=>c.group===group); if(!cols.some(c=>c.key==='plot_code')) cols.unshift(template.columns.find(c=>c.key==='plot_code')!); add({basic:'基本信息',confirm:'确权信息',ext:'扩展信息'}[group],tables[group],cols,false) } }
 return wb
}
export function exportRows(rows: DataRow[], template: TemplateDefinition, mode: 'single' | 'three', name='合成演示_地块导入.xlsx') { XLSX.writeFile(makeWorkbook(rows,template,mode),name) }
export function exportQuality(issues: QualityIssue[]) { const wb=XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(issues.map(i=>({'地块编码':i.plotCode,'级别':i.level,'问题':i.desc,'建议':i.suggest}))),'质检报告'); XLSX.writeFile(wb,'合成演示_质检报告.xlsx') }
