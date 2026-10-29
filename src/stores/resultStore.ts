import { computed,ref } from 'vue'
import { defineStore } from 'pinia'
import { useTaskStore } from './taskStore'
import { useFieldLevelStore } from './fieldLevelStore'
import { useMappingStore } from './mappingStore'
import { transform } from '../services/transform'
import { checkQuality } from '../services/quality'
import { splitTables,joinTables } from '../services/joinTables'
import { loadJSON,saveJSON } from '../utils/storage'
import { loadMock } from '../api/mockApi'
import type { UploadResult } from '../types'
import { standardizeVector,standardVectorRows } from '../services/standardVector'
import type { StandardVector } from '../services/standardVector'
import { profileStorageKey } from '../services/profile'
export const useResultStore=defineStore('result',()=>{
 const task=useTaskStore(),fields=useFieldLevelStore(),mapping=useMappingStore()
 const key=()=>profileStorageKey(task.activeId,'manual');const uploads:Record<string,UploadResult|null>={}
 const vectors=ref<Record<string,StandardVector>>({})
 const standardVector=computed(()=>vectors.value[task.activeId]||null)
 const standardRows=computed(()=>standardVector.value?standardVectorRows(standardVector.value):[])
 const signature=computed(()=>JSON.stringify({template:task.template,plots:task.plots,mappings:mapping.suggestions,fields:fields.levels,overrides:overrides.value}))
 const vectorStale=computed(()=>!!standardVector.value&&standardVector.value.signature!==signature.value)
 function generateVector(){if(mapping.problems.length)throw new Error('请先完成映射确认');if(!task.template)throw new Error('模板未加载');vectors.value[task.activeId]=standardizeVector(task.plots,rows.value,task.template,signature.value)}
 const overrides=ref<Record<string,Record<string,unknown>>>({}),acknowledged=ref<string[]>([]),upload=ref<UploadResult|null>(null),notice=ref('')
 function load(){upload.value=uploads[task.activeId]||null;acknowledged.value=[];notice.value='';overrides.value=loadJSON<Record<string,Record<string,unknown>>>(key(),(v):v is Record<string,Record<string,unknown>>=>!!v&&typeof v==='object'&&!Array.isArray(v)&&Object.values(v).every(r=>!!r&&typeof r==='object'&&!Array.isArray(r)&&Object.values(r).every(x=>x===null||['string','number','boolean'].includes(typeof x))))||{}}
 const transformed=computed(()=>task.template?transform(task.plots,mapping.suggestions,fields.levels,task.template,overrides.value):{rows:[],provenance:{}})
 const rows=computed(()=>transformed.value.rows)
 const tables=computed(()=>task.template?splitTables(rows.value,task.template):{basic:[],confirm:[],ext:[]})
 const joined=computed(()=>joinTables(tables.value))
 const issues=computed(()=>checkQuality(rows.value,fields.levels,task.plots,task.dictionaries).map(i=>({...i,status:acknowledged.value.includes(i.id)?'acknowledged' as const:'open' as const})))
 function edit(rowId:string,field:string,value:unknown){ if(!overrides.value[rowId]) overrides.value[rowId]={};overrides.value[rowId][field]=value;notice.value=saveJSON(key(),overrides.value)?'人工补充已保存，质检已重新计算':'已更新；本地存储不可用' }
 function acknowledge(id:string){if(!acknowledged.value.includes(id))acknowledged.value.push(id)}
 async function simulate(){ if(!standardVector.value||vectorStale.value)throw new Error('请先生成当前配置的标准矢量');if(mapping.problems.length)throw new Error('请先完成低置信度映射确认并解决冲突');const submissionId=task.activeId;const snapshot=JSON.parse(JSON.stringify(standardRows.value));const failedRows=standardRows.value.flatMap((r,i)=>{const blocks=issues.value.filter(q=>q.rowId===r.rowId&&q.level==='block');return blocks.length?[{rowId:r.rowId,row:i+1,plotCode:r.plot_code,reason:blocks.map(q=>q.desc).join('；'),suggest:blocks.map(q=>q.suggest).join('；')}]:[]});await loadMock('upload-result.json');const receipt:UploadResult={id:`mock-${Date.now()}`,simulated:true,total:snapshot.length,success:snapshot.length-failedRows.length,failed:failedRows.length,failedRows,snapshot,createdAt:new Date().toISOString()};uploads[submissionId]=receipt;if(task.activeId===submissionId)upload.value=receipt }
 return{standardVector,standardRows,vectorStale,generateVector,overrides,upload,notice,load,rows,tables,joined,issues,transformed,edit,acknowledge,simulate}
})
