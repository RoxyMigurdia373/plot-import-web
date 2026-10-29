import { defineStore } from 'pinia'
import { computed,ref } from 'vue'
import { useTaskStore } from './taskStore'
import { profileStorageKey } from '../services/profile'
import { loadJSON,saveJSON } from '../utils/storage'
import { mappingProblems } from '../services/transform'
import type { MappingSuggestion } from '../types'

export const useMappingStore=defineStore('mapping',()=>{
 const task=useTaskStore();const key=()=>profileStorageKey(task.activeId,'mapping')
 const suggestions=ref<MappingSuggestion[]>([]),notice=ref('');const problems=computed(()=>mappingProblems(suggestions.value))
 async function load(){notice.value='';const defaults=structuredClone(JSON.parse(JSON.stringify(task.defaultMappings))) as MappingSuggestion[];const saved=loadJSON<MappingSuggestion[]>(key(),(v):v is MappingSuggestion[]=>Array.isArray(v)&&v.length===defaults.length&&v.every((m,i)=>m?.id===defaults[i].id&&['auto','confirmed','rejected'].includes(m.status)&&(m.selectedTarget===null||typeof m.selectedTarget==='string')));suggestions.value=defaults.map((d,i)=>({...d,...(saved?{status:saved[i].status,selectedTarget:saved[i].selectedTarget,needConfirm:defaults[i].needConfirm||saved[i].needConfirm===true}:{})}))}
 function update(id:string,patch:Partial<MappingSuggestion>){const m=suggestions.value.find(m=>m.id===id);if(m)Object.assign(m,patch);notice.value=saveJSON(key(),suggestions.value)?'映射配置已保存':'本地存储不可用，修改仅在当前会话有效'}
 async function reset(){suggestions.value=structuredClone(JSON.parse(JSON.stringify(task.defaultMappings))) as MappingSuggestion[];saveJSON(key(),suggestions.value);notice.value='已恢复初始推荐'}
 return {suggestions,notice,problems,load,update,reset}
})
