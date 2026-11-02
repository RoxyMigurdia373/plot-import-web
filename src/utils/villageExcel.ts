import * as XLSX from 'xlsx'
import { zipSync } from 'fflate'
import { makeWorkbook } from './excel'
import type { TemplateDefinition } from '../types'
import type { VillageGroup } from '../services/villageExport'
import { makeCSVBytes } from './tableExport'
import type { TableFormat,CSVEncoding } from './tableExport'
import { saveBlob } from './saveFile'

export function makeVillageArchive(groups:VillageGroup[],template:TemplateDefinition,format:TableFormat='xlsx',encoding:CSVEncoding='utf8'):Uint8Array{
 if(!groups.length)throw new Error('没有可导出的村')
 const files:Record<string,Uint8Array>={}
 for(const group of groups){files[`${group.fileStem}.${format}`]=format==='csv'?makeCSVBytes(group.rows,template,encoding):new Uint8Array(XLSX.write(makeWorkbook(group.rows,template,'single'),{bookType:'xlsx',type:'array'}))}
 return zipSync(files,{level:0})
}
export function downloadVillageArchive(groups:VillageGroup[],template:TemplateDefinition,format:TableFormat='xlsx',encoding:CSVEncoding='utf8'){
 const bytes=makeVillageArchive(groups,template,format,encoding)
 const blob=new Blob([new Uint8Array(bytes).buffer],{type:'application/zip'})
 return saveBlob(blob,`村界导入_每村一表_${format.toUpperCase()}.zip`)
}
