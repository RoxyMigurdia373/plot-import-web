import { defineStore } from 'pinia'
import { computed,ref } from 'vue'
import { loadMock } from '../api/mockApi'
import { functions } from '../services/profile'
import type { TaskInfo,PlotCollection,RawField,TemplateDefinition,FieldLevel,MappingSuggestion } from '../types'
export const useTaskStore=defineStore('task',()=>{
 const task=ref<TaskInfo|null>(null),plots=ref<PlotCollection>({type:'FeatureCollection',features:[]}),rawFields=ref<RawField[]>([]),error=ref(''),loading=ref(false),activeId=ref('full-plot')
 const bundles=ref<Record<string,{template:TemplateDefinition;fields:FieldLevel[];mappings:MappingSuggestion[]}>>({})
 const profile=computed(()=>functions.find(f=>f.id===activeId.value)!),template=computed(()=>bundles.value[activeId.value]?.template||null),defaultFields=computed(()=>bundles.value[activeId.value]?.fields||[]),defaultMappings=computed(()=>bundles.value[activeId.value]?.mappings||[]),dictionaries=computed(()=>profile.value.dictionaries)
 const path=(step:string)=>`/process/${activeId.value}/${step}`
 async function load(){loading.value=true;error.value='';try{
 const [t,p,r,loaded]=await Promise.all([loadMock<TaskInfo>('task.json'),loadMock<PlotCollection>('plots.geojson'),loadMock<RawField[]>('raw-fields.json'),Promise.all(functions.map(async f=>{const [template,fields,mappings]=await Promise.all([loadMock<TemplateDefinition>(f.templateFile),loadMock<FieldLevel[]>(f.fieldsFile),loadMock<MappingSuggestion[]>(f.mappingsFile)]);return [f.id,{template,fields,mappings}] as const}))]);task.value=t;plots.value=p;rawFields.value=r;bundles.value=Object.fromEntries(loaded)
 }catch(e){error.value=String(e);throw e}finally{loading.value=false}}
 return {task,plots,rawFields,profile,activeId,template,defaultFields,defaultMappings,dictionaries,error,loading,path,load}
})
