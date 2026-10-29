import { computed,ref } from 'vue'
import { defineStore } from 'pinia'
import { useTaskStore } from './taskStore'
import { parseVector,sourceFields,generatePair } from '../services/simplePipeline'
import type { RawVector,FieldMapping } from '../services/simplePipeline'
import type { StandardVector } from '../services/standardVector'
import { groupVillages } from '../services/villageExport'
import type { TopologyReport } from '../services/topology'
export const useSimpleFlowStore=defineStore('simple-flow',()=>{
 const task=useTaskStore(),source=ref<RawVector|null>(null),fileName=ref(''),demo=ref(false),mappings=ref<Record<string,FieldMapping>>({}),outputs=ref<Record<string,StandardVector>>({}),report=ref<TopologyReport|null>(null),checking=ref(false),checkError=ref('')
 const villageGroupField=ref('')
 const villagePreview=computed(()=>task.activeId==='village-boundary'&&source.value&&task.template?groupVillages(generatePair(source.value,mapping.value,task.template),source.value,villageGroupField.value):{groups:[],errors:[]})
 const villageGroups=computed(()=>task.activeId==='village-boundary'&&source.value&&output.value?groupVillages(output.value,source.value,villageGroupField.value):{groups:[],errors:[]})
 function setVillageGroup(field:string){villageGroupField.value=field;delete outputs.value['village-boundary']}
 let worker:Worker|undefined,timer:ReturnType<typeof setTimeout>|undefined
 const fields=computed(()=>source.value?sourceFields(source.value):[]),mapping=computed(()=>mappings.value[task.activeId]||{}),output=computed(()=>outputs.value[task.activeId]||null)
 const blocking=computed(()=>report.value?.issues.filter(i=>i.level==='block').length||0)
 function setSource(text:string,name:string,isDemo=false){const parsed=parseVector(text);setParsedSource(parsed,name,isDemo)}
 function setParsedSource(parsed:RawVector,name:string,isDemo=false){source.value=parsed;fileName.value=name;demo.value=isDemo;villageGroupField.value='';mappings.value={};outputs.value={};runTopology()}
 function map(key:string,field:string){if(!mappings.value[task.activeId])mappings.value[task.activeId]={};mappings.value[task.activeId][key]=field||null;delete outputs.value[task.activeId]}
 function runTopology(){worker?.terminate();clearTimeout(timer);report.value=null;checkError.value='';checking.value=true;if(!source.value){checking.value=false;return}
  try{const current=new Worker(new URL('../workers/topology.worker.ts',import.meta.url),{type:'module'});worker=current
   const finish=()=>{clearTimeout(timer);current.terminate();checking.value=false}
   current.onmessage=e=>{if(worker!==current)return;report.value=e.data.report||null;checkError.value=e.data.error||'';finish()}
   current.onerror=()=>{if(worker!==current)return;checkError.value='拓扑检查未完成，请重试';finish()}
   timer=setTimeout(()=>{checkError.value='拓扑检查超过60秒，请减少要素或简化源文件后重试';finish()},60000)
   current.postMessage(JSON.parse(JSON.stringify(source.value)))
  }catch(e){checking.value=false;checkError.value=String(e)}
 }
 function generate(){if(!source.value||!task.template)throw new Error('请先上传原始矢量并选择模板');if(checking.value||!report.value||checkError.value)throw new Error('请等待拓扑检查完成');if(blocking.value)throw new Error('存在阻断拓扑问题，请修复源矢量后重新上传');if(task.activeId==='village-boundary'&&villagePreview.value.errors.length)throw new Error(villagePreview.value.errors[0]);outputs.value[task.activeId]=generatePair(source.value,mapping.value,task.template)}
 return {villageGroupField,villagePreview,villageGroups,setVillageGroup,source,fileName,demo,fields,mapping,output,report,checking,checkError,blocking,setSource,setParsedSource,map,runTopology,generate}
})
