<script setup lang="ts">
import { computed,ref } from 'vue'
import PageHeader from '../components/layout/PageHeader.vue'
import DataTable from '../components/table/DataTable.vue'
import Toast from '../components/common/Toast.vue'
import { useTaskStore } from '../stores/taskStore'
import { useResultStore } from '../stores/resultStore'
import { useMappingStore } from '../stores/mappingStore'
import { downloadJSON } from '../utils/download'
const task=useTaskStore(),result=useResultStore(),mapping=useMappingStore(),message=ref(''),detail=ref<Record<string,unknown>|null>(null)
const columns=computed(()=>result.standardVector?.template.columns.map(c=>({key:c.key,label:c.header}))||[])
const emptyCount=computed(()=>result.standardVector?.geojson.features.reduce((n,f)=>n+Object.values(f.properties).filter(v=>v===null).length,0)||0)
function generate(){try{result.generateVector();message.value='标准矢量已生成，每个地块都包含完整模板字段，缺失值为 null。'}catch(e){message.value=String(e)}}
function download(){if(result.standardVector&&!result.vectorStale)downloadJSON(result.standardVector.geojson,`合成演示_${task.profile.name}_标准矢量.geojson`)}
</script>
<template><PageHeader eyebrow="STANDARD VECTOR / COMPLETE SCHEMA" :title="`${task.profile.name} · 标准矢量`" description="原始矢量先转换为模板同名属性。每个要素保留全部字段及原始几何，无值字段明确写入 null。"><button class="secondary" :disabled="!!mapping.problems.length" @click="generate">{{result.standardVector?'重新生成标准矢量':'生成标准矢量'}}</button><button :disabled="!result.standardVector||result.vectorStale" @click="download">导出标准矢量 ↓</button></PageHeader><Toast :message="message"/><div v-if="result.vectorStale" class="notice">映射、默认值或人工补充已变更。下方是上一版标准矢量，请重新生成后导出。</div><div v-if="mapping.problems.length" class="notice">还有映射未确认。<RouterLink :to="task.path('mapping')">返回映射 →</RouterLink></div><template v-if="result.standardVector"><div class="notice success-notice">{{result.standardVector.geojson.features.length}} 个地块 · 每个要素包含 {{columns.length}} 个标准属性字段 · {{emptyCount}} 个空值单元格均保留字段名</div><section class="panel"><div class="section-heading"><div><h2>标准矢量属性表</h2><p>GeoJSON properties 使用原始模板表头，包括换行；内部 rowId 使用 Feature.id，不混入业务字段。</p></div><RouterLink class="button" :class="{disabled:result.vectorStale}" :to="task.path('wide-table')">选择字段，导出表格 →</RouterLink></div><DataTable :columns="columns" :rows="result.standardRows" @select="detail=$event"><template v-for="c in columns" :key="c.key" #[`cell-${c.key}`]="{value}"><span v-if="value===null" class="null-value">null</span><span v-else class="cell-text" :title="String(value)">{{value}}</span></template></DataTable></section><p class="hint">本次生成结果保存在当前会话，三个功能各自独立；刷新后可按保存的映射重新生成。空字段不删除，默认值只使用你明确配置的值。</p></template><section v-else class="panel empty"><h2>尚未生成标准矢量</h2><p>完成映射确认后生成；表格导出只读取这份标准矢量。</p><RouterLink class="button" :to="task.path('mapping')">前往映射 →</RouterLink></section><div v-if="detail" class="modal-backdrop" @click.self="detail=null"><section class="modal"><div class="section-heading"><h2>标准要素属性</h2><button class="secondary" @click="detail=null">关闭</button></div><pre class="vector-json">{{result.standardVector?.geojson.features.find(f=>String(f.id)===detail?.rowId)?.properties}}</pre></section></div></template>
