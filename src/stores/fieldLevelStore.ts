import { defineStore } from 'pinia'
import { ref } from 'vue'
import { useTaskStore } from './taskStore'
import { profileStorageKey } from '../services/profile'
import { loadJSON,saveJSON } from '../utils/storage'
import type { FieldLevel } from '../types'

export const useFieldLevelStore=defineStore('fields',()=>{
 const task=useTaskStore();const key=()=>profileStorageKey(task.activeId,'fields')
 const levels=ref<FieldLevel[]>([]),notice=ref('')
 async function load(){notice.value=''; const defaults=structuredClone(JSON.parse(JSON.stringify(task.defaultFields))) as FieldLevel[]; const saved=loadJSON<FieldLevel[]>(key(),(v):v is FieldLevel[]=>Array.isArray(v)&&v.length===defaults.length&&v.every((f,i)=>f?.key===defaults[i].key&&['yes','no','unknown'].includes(f.platformRequired)&&typeof f.allowEmpty==='boolean'&&(f.defaultValue===null||['string','number','boolean'].includes(typeof f.defaultValue)))); levels.value=defaults.map((d,i)=>({...d,...(saved ? {defaultValue:saved[i].defaultValue,allowEmpty:saved[i].allowEmpty,platformRequired:saved[i].platformRequired}: {})})) }
 function update(field:string,patch:Partial<FieldLevel>){ const f=levels.value.find(f=>f.key===field);if(f) Object.assign(f,patch);notice.value=saveJSON(key(),levels.value)?'配置已保存到本地':'浏览器存储不可用，本次修改仅在当前页面会话有效' }
 async function reset(){levels.value=structuredClone(JSON.parse(JSON.stringify(task.defaultFields))) as FieldLevel[];notice.value=saveJSON(key(),levels.value)?'已恢复默认配置':'已恢复默认；本地存储不可用'}
 return{levels,notice,load,update,reset}
})
