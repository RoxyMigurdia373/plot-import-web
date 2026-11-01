import { defineStore } from 'pinia'
import { computed, ref, watch } from 'vue'
import { loadMock } from '../api/mockApi'
import { functions } from '../services/profile'
import { useTemplateStore } from './templateStore'
import { loadJSON, saveJSON } from '../utils/storage'
import type { TaskInfo,PlotCollection,RawField,TemplateDefinition,FieldLevel,MappingSuggestion } from '../types'
const ACTIVE_KEY = 'plot-import:v2:active-template'
export const useTaskStore=defineStore('task',()=>{
 const task=ref<TaskInfo|null>(null),plots=ref<PlotCollection>({type:'FeatureCollection',features:[]}),rawFields=ref<RawField[]>([]),error=ref(''),loading=ref(false),activeId=ref('full-plot')
 const bundles=ref<Record<string,{template:TemplateDefinition;fields:FieldLevel[];mappings:MappingSuggestion[]}>>({})
 const library=useTemplateStore()
 const profile=computed(()=>library.profile(activeId.value)||functions.find(f=>f.id===activeId.value)||{id:activeId.value,name:'自定义模板',description:'',templateFile:'',fieldsFile:'',mappingsFile:'',dictionaries:{use_l1:[],use_l2:[],areaTolerance:.2}})
 const template=computed(()=>library.definition(activeId.value)||bundles.value[activeId.value]?.template||null)
 const options=computed(()=>library.records.map(r=>({id:r.id,name:r.name,description:r.description,builtin:r.builtin,edited:r.edited,fieldCount:r.definition.columns.length})))
 const defaultFields=computed(()=>bundles.value[activeId.value]?.fields||[]),defaultMappings=computed(()=>bundles.value[activeId.value]?.mappings||[]),dictionaries=computed(()=>profile.value.dictionaries)
 const path=(step:string)=>`/process/${activeId.value}/${step}`
 const savedActive=loadJSON<string>(ACTIVE_KEY,(value):value is string=>typeof value==='string'&&!!value)
 if(savedActive&&library.record(savedActive))activeId.value=savedActive
 watch(activeId,(id)=>{saveJSON(ACTIVE_KEY,id)})
 async function load(){loading.value=true;error.value='';try{
 const [t,p,r,loaded]=await Promise.all([loadMock<TaskInfo>('task.json'),loadMock<PlotCollection>('plots.geojson'),loadMock<RawField[]>('raw-fields.json'),Promise.all(functions.map(async f=>{const [template,fields,mappings]=await Promise.all([loadMock<TemplateDefinition>(f.templateFile),loadMock<FieldLevel[]>(f.fieldsFile),loadMock<MappingSuggestion[]>(f.mappingsFile)]);return [f.id,{template,fields,mappings}] as const}))]);task.value=t;plots.value=p;rawFields.value=r;bundles.value=Object.fromEntries(loaded)
 for(const f of functions){const bundle=bundles.value[f.id];if(bundle)library.registerBuiltin(f.id,f.name,f.description,bundle.template)}
 if(savedActive&&library.record(savedActive))activeId.value=savedActive
 }catch(e){error.value=String(e);throw e}finally{loading.value=false}}
 return {task,plots,rawFields,profile,activeId,template,options,defaultFields,defaultMappings,dictionaries,error,loading,path,load}
})
