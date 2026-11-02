import { computed,ref,shallowRef } from 'vue'
import { defineStore } from 'pinia'
import { useTaskStore } from './taskStore'
import { useTemplateStore,makeColumnKey } from './templateStore'
import { loadJSON,saveJSON } from '../utils/storage'
import { parseVector,sourceFields,generatePair } from '../services/simplePipeline'
import type { TextEncoding } from '../utils/textEncoding'
import { VALUE_PREFIX,constantValue,isConstant } from '../services/simplePipeline'
import type { RawVector,FieldMapping } from '../services/simplePipeline'
import type { StandardVector } from '../services/standardVector'
import type { TemplateColumn } from '../types'
import { groupVillages } from '../services/villageExport'
const MAPPING_KEY='plot-import:v2:mappings'
const isSavedMappings=(value:unknown):value is Record<string,FieldMapping>=>!!value&&typeof value==='object'&&Object.values(value as Record<string,unknown>).every(entry=>!!entry&&typeof entry==='object'&&Object.values(entry as Record<string,unknown>).every(field=>field===null||typeof field==='string'))
export const useSimpleFlowStore=defineStore('simple-flow',()=>{
 const task=useTaskStore(),library=useTemplateStore(),source=shallowRef<RawVector|null>(null),fileName=ref(''),demo=ref(false),mappings=ref<Record<string,FieldMapping>>(loadJSON<Record<string,FieldMapping>>(MAPPING_KEY,isSavedMappings)||{}),outputs=ref<Record<string,StandardVector>>({})
 const villageGroupField=ref('')
 function persistMappings(){saveJSON(MAPPING_KEY,mappings.value)}
 const villagePreview=computed(()=>task.activeId==='village-boundary'&&source.value&&task.template?groupVillages(generatePair(source.value,mapping.value,task.template),source.value,villageGroupField.value):{groups:[],errors:[]})
 const villageGroups=computed(()=>task.activeId==='village-boundary'&&source.value&&output.value?groupVillages(output.value,source.value,villageGroupField.value):{groups:[],errors:[]})
 function setVillageGroup(field:string){villageGroupField.value=field;delete outputs.value['village-boundary']}
 const fields=computed(()=>source.value?sourceFields(source.value):[]),mapping=computed(()=>mappings.value[task.activeId]||{}),output=computed(()=>outputs.value[task.activeId]||null)
 const template=computed(()=>task.template),templateId=computed(()=>task.activeId)
 function setSource(text:string,name:string,isDemo=false){const parsed=parseVector(text);setParsedSource(parsed,name,isDemo)}
 const encoding=ref<TextEncoding|''>('')
 function setParsedSource(parsed:RawVector,name:string,isDemo=false,sourceEncoding:TextEncoding|''=''){source.value=parsed;fileName.value=name;demo.value=isDemo;encoding.value=sourceEncoding;villageGroupField.value='';outputs.value={}}
 function map(key:string,field:string){if(!mappings.value[task.activeId])mappings.value[task.activeId]={};mappings.value[task.activeId][key]=field||null;delete outputs.value[task.activeId];persistMappings()}
 function mapped(key:string):string{return mapping.value[key]||''}
 function constText(key:string):string{return constantValue(mapping.value[key])}
 function isConst(key:string):boolean{return isConstant(mapping.value[key])}
 function setConst(key:string,text:string){map(key,`${VALUE_PREFIX}${text}`)}
 function clearMapping(key:string){map(key,'')}
 function invalidate(){delete outputs.value[task.activeId]}
 function editTemplate(mutate:(columns:TemplateColumn[])=>void){if(!task.template)throw new Error('请先选择模板');library.updateDefinition(task.activeId,(definition)=>{mutate(definition.columns);definition.columns.forEach((column,index)=>{column.order=index+1})});invalidate()}
 function addColumn(){editTemplate((columns)=>{if(columns.length>=200)throw new Error('模板字段最多 200 个');const key=makeColumnKey(columns);columns.push({key,header:`新字段 ${columns.length+1}`,group:'basic',order:columns.length+1,dataType:'string'});map(key,'')});return true}
 function renameColumn(key:string,header:string){const clean=header.replace(/\s+/g,' ').trim();if(!clean)return false;editTemplate((columns)=>{const column=columns.find(c=>c.key===key);if(column)column.header=clean});return true}
 function removeColumn(key:string){if((task.template?.columns.length||0)<=1)throw new Error('模板至少保留一个字段');editTemplate((columns)=>{const index=columns.findIndex(c=>c.key===key);if(index>=0)columns.splice(index,1)});if(mappings.value[task.activeId])delete mappings.value[task.activeId][key];return true}
 function moveColumn(key:string,offset:number){editTemplate((columns)=>{const index=columns.findIndex(c=>c.key===key);const target=index+offset;if(index<0||target<0||target>=columns.length)return;const [item]=columns.splice(index,1);columns.splice(target,0,item)});return true}
 function saveTemplate(name:string,description:string,existingId?:string|null){if(!task.template)throw new Error('请先选择模板');const id=library.saveAsTemplate({id:existingId||null,name,description,definition:task.template,origin:'custom'});task.activeId=id;return id}
 function resetTemplate(){if(library.resetBuiltin(task.activeId))invalidate()}
 function generate(){if(!source.value||!task.template)throw new Error('请先上传原始矢量并选择模板');if(task.activeId==='village-boundary'&&villagePreview.value.errors.length)throw new Error(villagePreview.value.errors[0]);outputs.value[task.activeId]=generatePair(source.value,mapping.value,task.template)}
 return {villageGroupField,villagePreview,villageGroups,setVillageGroup,source,fileName,demo,encoding,fields,mapping,output,template,templateId,constText,isConst,setConst,clearMapping,mapped,setSource,setParsedSource,map,generate,invalidate,addColumn,renameColumn,removeColumn,moveColumn,saveTemplate,resetTemplate}
})
