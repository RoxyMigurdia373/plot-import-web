<script setup lang="ts">
import { computed,ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/layout/PageHeader.vue'
import Toast from '../components/common/Toast.vue'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import SaveTemplateDialog from '../components/template/SaveTemplateDialog.vue'
import MapPreview from '../components/map/MapPreview.vue'
import { useSimpleFlowStore } from '../stores/simpleFlowStore'
import { useTaskStore } from '../stores/taskStore'
import { useTemplateStore } from '../stores/templateStore'
import { GEOMETRY_SOURCE } from '../services/simplePipeline'
import type { PlotCollection,TemplateColumn } from '../types'
const task=useTaskStore(),flow=useSimpleFlowStore(),library=useTemplateStore(),router=useRouter(),search=ref(''),message=ref(''),error=ref(''),confirm=ref(false),highlight=ref(''),saveOpen=ref(false),saveHint=ref('')
const columns=computed(()=>flow.template?.columns.filter(c=>`${c.header} ${c.key}`.includes(search.value))||[])
const mapped=computed(()=>flow.template?.columns.filter(c=>flow.mapped(c.key)).length||0)
const currentRecord=computed(()=>library.record(task.activeId))
const isCustom=computed(()=>!!currentRecord.value&&!currentRecord.value.builtin)
const isBuiltinEdited=computed(()=>!!currentRecord.value?.builtin&&currentRecord.value.edited)
const canGenerate=computed(()=>!!flow.source&&(task.activeId!=='village-boundary'||!flow.villagePreview.errors.length))
const mapData=computed<PlotCollection>(()=>({type:'FeatureCollection',features:(flow.source?.features||[]).map((f,i)=>({...f,properties:{rowId:`source-${i+1}`}}))}))
function generate(){try{flow.generate();router.push('/output')}catch(e){message.value=String(e)}}
function next(){generate()}
function selectValue(key:string):string{return flow.isConst(key)?'__const__':flow.mapped(key)}
function chooseSource(key:string,value:string){if(value==='__const__')flow.setConst(key,flow.constText(key));else flow.map(key,value)}
function rename(c:TemplateColumn,event:Event){const input=event.target as HTMLInputElement;if(!flow.renameColumn(c.key,input.value)){input.value=c.header;error.value='字段名称不能为空'}else error.value=''}
function addColumn(){try{flow.addColumn();message.value='已新增一个字段，请填写表头并选择来源'}catch(e){error.value=String(e)}}
function removeColumn(c:TemplateColumn){try{flow.removeColumn(c.key);message.value=`已删除字段“${c.header}”`}catch(e){error.value=String(e)}}
function openSave(){saveHint.value=isCustom.value?'同名保存会覆盖这个自建模板，换个名称即可另存为新模板。':'内置模板不会被修改，保存后会成为可复用的自建模板。';saveOpen.value=true}
function saveTemplate(payload:{name:string;description:string}){
 try{
  const record=currentRecord.value
  const sameName=!!record&&!record.builtin&&record.name===payload.name
  const id=flow.saveTemplate(payload.name,payload.description,sameName?record.id:null)
  saveOpen.value=false
  const saved=library.record(id)
  message.value=`模板“${saved?.name||payload.name}”已保存（${saved?.definition.columns.length||0} 个字段），下次打开可直接选用`
 }catch(e){error.value=String(e)}
}
function resetTemplate(){flow.resetTemplate();message.value='已恢复内置模板默认字段'}
function sample(key:string){const selected=flow.mapping[key];if(!selected)return '留空';if(selected===GEOMETRY_SOURCE)return '从源几何转为 WKT';if(flow.isConst(key))return flow.constText(key)?`固定值：${flow.constText(key)}`:'固定值（空）';const raw=selected.startsWith('value:')?selected.slice(6):selected.startsWith('field:')?selected.slice(6):selected;const value=flow.source?.features.find(f=>f.properties[raw]!==null&&f.properties[raw]!==undefined)?.properties[raw];return value===null||value===undefined?'来源为空':typeof value==='object'?JSON.stringify(value):String(value)}
</script>
<template>
<PageHeader title="字段映射" description="选择原始字段对应的模板列；可新增或改名模板字段，未映射项留空，表头完整保留。"><RouterLink class="button secondary" to="/">重新上传</RouterLink><button :disabled="!canGenerate" @click="next">生成矢量和表格 →</button></PageHeader>
<div v-if="!flow.source" class="panel empty"><h2>请先上传原始矢量</h2><RouterLink class="button" to="/">返回上传</RouterLink></div>
<template v-else>
 <div class="function-context"><span>{{flow.fileName}}</span><select v-model="task.activeId" aria-label="目标表格模板"><option v-for="f in task.options" :key="f.id" :value="f.id">{{f.name}}</option></select><span>已映射 {{mapped}} / {{flow.template?.columns.length||0}} 字段 · 其余输出空值</span></div>
 <Toast :message="message"/>
 <Toast :message="error"/>
 <section v-if="task.activeId==='village-boundary'" class="panel village-grouping"><div class="section-heading"><div><h2>按村分表</h2><p>每个村一个表格，同村多个要素保留多行。</p></div><span class="badge neutral">{{flow.villagePreview.groups.length}} 个村</span></div><label>村标识依据 <select aria-label="村标识依据" :value="flow.villageGroupField" @change="flow.setVillageGroup(($event.target as HTMLSelectElement).value)"><option value="">使用已映射的行政区划编码</option><option v-for="f in flow.fields" :key="f" :value="f">原始字段：{{f}}</option></select></label><p class="hint">请选择能唯一区分村的字段，避免仅凭同名村合并。该字段只用于分表，不会回填未映射的模板列。</p><div v-if="flow.villagePreview.errors.length" class="notice">{{flow.villagePreview.errors[0]}}<span v-if="flow.villagePreview.errors.length>1">（共 {{flow.villagePreview.errors.length}} 项）</span></div><div v-else class="raw-tags"><span v-for="g in flow.villagePreview.groups" :key="g.key">{{g.name}} · {{g.key}} · {{g.rows.length}} 个要素</span></div></section>
 <div class="mapping-workspace">
  <section class="panel">
   <div class="section-heading"><h2>表格字段 ← 原始字段</h2><input v-model="search" aria-label="搜索模板字段" placeholder="搜索模板字段"></div>
   <div class="template-toolbar">
    <button class="secondary small" @click="addColumn">+ 新增字段</button>
    <button class="secondary small" @click="openSave">{{isCustom?'保存模板':'保存为模板'}}</button>
    <button v-if="isBuiltinEdited" class="text-button" @click="resetTemplate">恢复内置默认</button>
    <span class="hint">{{isCustom?'自建模板改动会自动保存到本机':'内置模板改名/增删字段后可另存为自建模板'}}</span>
   </div>
   <div class="table-scroll"><table><thead><tr><th>模板字段</th><th>选择原始字段</th><th>预览值</th></tr></thead><tbody>
    <tr v-for="c in columns" :key="c.key">
     <td class="wrap"><input class="header-input" :value="c.header" :aria-label="`字段名称 ${c.header}`" maxlength="120" @change="rename(c,$event)"><div class="column-tools"><button class="text-button" :disabled="(flow.template?.columns.length||0)<=1" @click="removeColumn(c)">删除字段</button></div></td>
     <td><select :aria-label="`映射 ${c.header}`" :value="selectValue(c.key)" @change="chooseSource(c.key,($event.target as HTMLSelectElement).value)"><option value="">不映射，留空</option><option v-if="c.key==='geom_wkt'" :value="GEOMETRY_SOURCE">源矢量几何 → WKT</option><option v-for="f in flow.fields" :key="f" :value="`field:${f}`">{{f}}</option><option value="__const__">固定值（手填文本）…</option></select><input v-if="flow.isConst(c.key)" class="const-input" :value="flow.constText(c.key)" :aria-label="`固定值 ${c.header}`" placeholder="每行都写入这段文本" @input="flow.setConst(c.key,($event.target as HTMLInputElement).value)"><button v-if="flow.isConst(c.key)" class="text-button" @click="flow.clearMapping(c.key)">改回字段映射</button></td>
     <td><span class="cell-text" :title="sample(c.key)">{{sample(c.key)}}</span></td>
    </tr>
    <tr v-if="!columns.length"><td colspan="3" class="empty">无匹配字段</td></tr>
   </tbody></table></div>
  </section>
  <aside>
   <section class="panel"><div class="section-heading"><h2>拓扑检查</h2></div><p class="hint">本工具只做字段映射与格式转换，不再检查矢量拓扑：重叠、缝隙、岛洞等都原样保留，几何不做任何修复。需要先修拓扑时，用配套的图斑拓扑检查与修复工具处理原始数据，再回到这里导入。</p></section>
   <section v-if="flow.source" class="panel map-panel"><h2>地块预览</h2><MapPreview :geojson="mapData" :highlight-row-id="highlight"/><p class="hint">预览按原始几何绘制，不做任何修复或裁剪。</p></section>
  </aside>
 </div>
 <ConfirmDialog v-if="confirm" title="存在拓扑警告，继续生成？" message="重复或重叠地块将原样保留，检查报告与生成结果同时保留。请确认已了解这些问题。" @cancel="confirm=false" @confirm="confirm=false;generate()"/>
 <SaveTemplateDialog :open="saveOpen" :title="isCustom?'保存模板':'保存为自建模板'" :name="currentRecord?.name||'新模板'" :description="currentRecord?.description||''" :hint="saveHint" :confirm-text="'保存模板'" @cancel="saveOpen=false" @save="saveTemplate"/>
</template>
</template>
