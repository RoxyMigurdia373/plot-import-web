<script setup lang="ts">
import { computed,ref,watch } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/layout/PageHeader.vue'
import DataTable from '../components/table/DataTable.vue'
import Toast from '../components/common/Toast.vue'
import { useTaskStore } from '../stores/taskStore'
import { useResultStore } from '../stores/resultStore'
import { selectedTemplate } from '../services/standardVector'
import { profileStorageKey } from '../services/profile'
import { loadJSON,saveJSON } from '../utils/storage'
import { exportRows } from '../utils/excel'
const task=useTaskStore(),result=useResultStore(),router=useRouter(),mode=ref<'single'|'three'>('single'),message=ref(''),search=ref(''),busy=ref(false),detail=ref<Record<string,unknown>|null>(null)
const allColumns=computed(()=>result.standardVector?.template.columns||[])
const key=()=>profileStorageKey(task.activeId,'export-fields')
const selected=ref<string[]>(loadJSON<string[]>(key(),(v):v is string[]=>Array.isArray(v)&&v.every(k=>typeof k==='string'&&allColumns.value.some(c=>c.key===k)))||allColumns.value.map(c=>c.key))
watch(selected,v=>{if(!saveJSON(key(),v))message.value='字段选择仅保留在本次会话，本地存储不可用'},{deep:true})
const visibleChoices=computed(()=>allColumns.value.filter(c=>`${c.header} ${c.key}`.includes(search.value)))
const columns=computed(()=>allColumns.value.filter(c=>selected.value.includes(c.key)).map(c=>({key:c.key,label:c.header})))
const allSelected=computed(()=>columns.value.length===allColumns.value.length&&allColumns.value.length>0)
const canExport=computed(()=>!!result.standardVector&&!result.vectorStale&&columns.value.length>0)
function download(){try{if(!canExport.value||!result.standardVector)return;const template=selectedTemplate(result.standardVector,selected.value);exportRows(result.standardRows,template,task.activeId==='full-plot'&&allSelected.value?mode.value:'single',`合成演示_${task.profile.name}_${columns.value.length}字段.xlsx`);message.value=`已从标准矢量导出 ${columns.value.length} 个字段；全空列仍保留表头。`}catch(e){message.value=String(e)}}
async function upload(){const id=task.activeId;busy.value=true;try{await result.simulate();if(task.activeId===id)router.push(task.path('upload-result'))}catch(e){message.value=String(e)}finally{busy.value=false}}
</script>
<template><PageHeader eyebrow="STANDARD VECTOR / SELECT FIELDS / EXCEL" :title="`${task.profile.name} · 选字段导表`" description="只从已生成的标准矢量属性中取值。勾选需要的字段，按模板顺序导出；空值仍保留列名。"><button class="secondary" :disabled="!canExport||!allSelected||busy" @click="upload">{{busy?'正在模拟…':'模拟全模板上传'}}</button><button :disabled="!canExport" @click="download">导出 Excel ↓</button></PageHeader><div v-if="!result.standardVector" class="notice">请先生成标准矢量，再选择导出字段。<RouterLink :to="task.path('vector-result')">前往标准矢量 →</RouterLink></div><div v-else-if="result.vectorStale" class="notice">映射或数据已修改，标准矢量需要重新生成；当前展示上一版结果，暂不导出。<RouterLink :to="task.path('vector-result')">重新生成 →</RouterLink></div><Toast :message="message"/><template v-if="result.standardVector"><div class="function-context"><span>数据源：{{task.profile.name}}标准矢量</span><span>{{result.standardRows.length}} 个要素 · 已选 {{columns.length}} / {{allColumns.length}} 个字段</span><RouterLink :to="task.path('vector-result')">查看 / 下载标准矢量 →</RouterLink></div><section class="panel"><div class="section-heading"><div><h2>选择导出字段</h2><p>勾选框决定实际导出列；下方表格的“显示列”只影响浏览，不影响导出。</p></div><div class="button-row"><button class="secondary small" @click="selected=allColumns.map(c=>c.key)">全选字段</button><button class="secondary small" @click="selected=[]">清空选择</button></div></div><input v-model="search" aria-label="搜索导出字段" placeholder="搜索标准字段"><div class="export-field-grid"><label v-for="c in visibleChoices" :key="c.key"><input v-model="selected" type="checkbox" :value="c.key" :aria-label="`导出 ${c.header}`"><span>{{c.header}}<small>{{c.key}}</small></span></label></div></section><section class="panel"><div class="section-heading"><div><h2>表格导出预览 · {{columns.length}} 列</h2><p>字段名来自标准矢量，null 在 Excel 中输出空单元格，数值 0 保留。</p></div><select v-model="mode" aria-label="导出模式"><option value="single">单 Sheet · 所选字段</option><option v-if="task.activeId==='full-plot'&&allSelected" value="three">辅助三 Sheet · 全字段</option></select></div><div v-if="!columns.length" class="notice">至少选择一个字段才能导出。</div><div v-else-if="!allSelected" class="notice">当前为自选字段导出，不是完整平台导入模板；模拟平台上传仅在全选字段时启用。</div><DataTable :columns="columns" :rows="result.standardRows" @select="detail=$event"/></section><div class="button-row export-links"><RouterLink :to="task.path('quality')">检查本功能质检结果 →</RouterLink></div></template><div v-if="detail" class="modal-backdrop" @click.self="detail=null"><section class="modal"><div class="section-heading"><h2>标准矢量字段值（只读）</h2><button class="secondary" @click="detail=null">关闭</button></div><pre class="vector-json">{{Object.fromEntries(columns.map(c=>[c.label,detail?.[c.key]??null]))}}</pre></section></div></template>
