<script setup lang="ts">
import { ref } from 'vue'
import PageHeader from '../components/layout/PageHeader.vue'
import Toast from '../components/common/Toast.vue'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import SaveTemplateDialog from '../components/template/SaveTemplateDialog.vue'
import { useSimpleFlowStore } from '../stores/simpleFlowStore'
import { useTaskStore } from '../stores/taskStore'
import { useTemplateStore } from '../stores/templateStore'
import { loadMock } from '../api/mockApi'
import { importVectorFiles } from '../services/fileImport'
import { importTemplateFile } from '../services/templateImport'
import { limitSummary, limits } from '../services/limits'
import type { TemplateDefinition } from '../types'
const flow=useSimpleFlowStore(),task=useTaskStore(),library=useTemplateStore(),error=ref(''),message=ref(''),busy=ref(false),dragging=ref(false),templateBusy=ref(false)
const fileInput=ref<HTMLInputElement|null>(null),importInput=ref<HTMLInputElement|null>(null)
const limitText=`${limitSummary}${limits.profile==='desktop'?'（本地窗口）':'（网页版）'}`
const pending=ref<{definition:TemplateDefinition;fileName:string;sheetName:string}|null>(null)
const renaming=ref<{id:string;name:string}|null>(null),removing=ref<{id:string;name:string}|null>(null)
async function read(files:FileList|null){if(!files?.length)return;busy.value=true;error.value='';message.value='';try{const result=await importVectorFiles(files);flow.setParsedSource(result.vector,result.fileName)}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{busy.value=false}}
async function demo(){try{const data=await loadMock(task.activeId==='village-boundary'?'village-demo.geojson':'flow-demo.geojson');flow.setSource(JSON.stringify(data),task.activeId==='village-boundary'?'两村边界_演示矢量.geojson':'演示村_原始矢量.geojson',true);error.value=''}catch(e){error.value=String(e)}}
function chooseTemplateFile(){importInput.value?.click()}
async function onTemplateFile(event:Event){const input=event.target as HTMLInputElement;const file=input.files?.[0];input.value='';if(!file)return;templateBusy.value=true;error.value='';try{const parsed=await importTemplateFile(file);pending.value=parsed}catch(e){error.value=e instanceof Error?e.message:String(e)}finally{templateBusy.value=false}}
function saveImported(payload:{name:string;description:string}){
 if(!pending.value)return
 try{const id=library.saveAsTemplate({name:payload.name,description:payload.description,definition:pending.value.definition,origin:'import'});task.activeId=id;message.value=`已保存模板“${payload.name}”，共 ${pending.value.definition.columns.length} 个字段`;pending.value=null}catch(e){error.value=e instanceof Error?e.message:String(e)}
}
function confirmRemove(){if(!removing.value)return;const target=removing.value;library.remove(target.id);if(task.activeId===target.id)task.activeId=library.records[0]?.id||'full-plot';message.value=`已删除模板“${target.name}”`;removing.value=null}
function confirmRename(payload:{name:string}){if(!renaming.value)return;try{library.rename(renaming.value.id,payload.name);message.value=`模板已重命名为“${payload.name}”`;renaming.value=null}catch(e){error.value=e instanceof Error?e.message:String(e)}}
</script>
<template>
<PageHeader title="上传原始矢量" description="选择文件和模板，下一步设置字段映射。"/>
<div class="two-column">
 <section class="panel"><h2>选择文件</h2><label class="dropzone" :class="{dragging}" @dragover.prevent="dragging=true" @dragleave="dragging=false" @drop.prevent="dragging=false;read($event.dataTransfer?.files||null)"><span class="upload-symbol">↥</span><strong>{{busy?'正在读取…':'拖入 GeoJSON、表格或 SHP，或点击选择文件'}}</strong><small>本地读取 · 支持 GeoJSON / Excel / CSV / SHP · {{ limitText }}</small><input ref="fileInput" type="file" accept=".geojson,.json,.csv,.xlsx,.xls,.zip,.shp,.dbf,.prj,.cpg" multiple :disabled="busy" @change="read(($event.target as HTMLInputElement).files)"></label><button class="secondary full-width" :disabled="busy" @click="demo">{{task.activeId==='village-boundary'?'使用两村边界演示矢量':'使用演示矢量'}}</button><Toast :message="error"/><p class="hint">仅在浏览器处理。SHP 请同时选择同名 SHP、DBF、PRJ（或上传 ZIP）；表格需含 WKT / GeoJSON 几何列。</p></section>
 <section class="panel">
  <div class="section-heading"><h2>选择导出模板</h2><button class="secondary small" :disabled="templateBusy" @click="chooseTemplateFile">{{templateBusy?'正在读取表头…':'导入表头生成模板…'}}</button></div>
  <input ref="importInput" type="file" accept=".csv,.xlsx,.xls,.txt" class="hidden-input" @change="onTemplateFile">
  <p class="hint">导入带表头的 CSV / Excel 即可生成新模板；保存后会记住名称，下次打开不用重新导入。</p>
  <div class="template-choices">
   <div v-for="f in task.options" :key="f.id" class="template-choice" :class="{chosen:task.activeId===f.id}">
    <label><input v-model="task.activeId" type="radio" name="template" :value="f.id"><span><strong>{{f.name}}</strong><span v-if="!f.builtin" class="badge neutral">自建</span><span v-if="f.builtin&&f.edited" class="badge warn">已修改</span><small>{{f.fieldCount}} 个模板字段 · {{f.description||'自定义字段模板'}}</small></span></label>
    <div v-if="!f.builtin" class="button-row template-actions"><button class="text-button" @click="renaming={id:f.id,name:f.name}">重命名</button><button class="text-button" @click="removing={id:f.id,name:f.name}">删除</button></div>
   </div>
   <p v-if="!task.options.length" class="hint">还没有模板，请先导入表头生成模板。</p>
  </div>
  <div v-if="flow.source" class="notice success-notice">已读取 {{flow.fileName}}<br>{{flow.source.features.length}} 个要素 · {{flow.fields.length}} 个原始字段 · {{flow.demo?'演示数据':'本地文件'}}</div>
  <RouterLink class="button full-width" :class="{disabled:!flow.source||busy}" to="/mapping">下一步：字段映射 →</RouterLink>
 </section>
</div>
<section v-if="flow.source" class="panel"><div class="section-heading"><h2>原始字段</h2></div><div class="raw-tags"><span v-for="f in flow.fields" :key="f">{{f}}</span></div></section>
<Toast :message="message"/>
<SaveTemplateDialog :open="!!pending" title="保存导入的模板" :name="pending?.fileName.replace(/\.[^.]+$/,'')||''" :description="pending?`由 ${pending.fileName} 的表头生成` :''" :hint="pending?`共 ${pending.definition.columns.length} 个字段，保存后可在模板列表中直接选用。`:''" @cancel="pending=null" @save="saveImported"/>
<SaveTemplateDialog :open="!!renaming" title="重命名模板" :name="renaming?.name||''" hint="只修改列表里的显示名称，字段不受影响。" confirm-text="保存名称" @cancel="renaming=null" @save="confirmRename"/>
<ConfirmDialog v-if="removing" title="删除这个模板？" :message="`“${removing.name}”会从本机模板列表中移除，已上传的矢量不受影响。`" @cancel="removing=null" @confirm="confirmRemove"/>
</template>
