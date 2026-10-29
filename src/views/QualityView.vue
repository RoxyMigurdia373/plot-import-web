<script setup lang="ts">
import { computed,ref } from 'vue'
import { useRouter } from 'vue-router'
import PageHeader from '../components/layout/PageHeader.vue'
import StatCard from '../components/common/StatCard.vue'
import QualityTable from '../components/quality/QualityTable.vue'
import ConfirmDialog from '../components/common/ConfirmDialog.vue'
import MapPreview from '../components/map/MapPreview.vue'
import RowDetailDrawer from '../components/table/RowDetailDrawer.vue'
import { useResultStore } from '../stores/resultStore'
import { useTaskStore } from '../stores/taskStore'
import { useMappingStore } from '../stores/mappingStore'
import { exportQuality } from '../utils/excel'
const result=useResultStore(),task=useTaskStore(),mapping=useMappingStore(),router=useRouter(),level=ref(''),type=ref(''),search=ref(''),confirm=ref(false),locate=ref(''),edit=ref('')
const filtered=computed(()=>result.issues.filter(q=>(!level.value||q.level===level.value)&&(!type.value||q.type===type.value)&&(!search.value||q.plotCode?.includes(search.value))))
const count=(l:string)=>result.issues.filter(q=>q.level===l).length
function next(){if(count('block'))confirm.value=true;else router.push(task.path('vector-result'))}
</script>
<template><PageHeader eyebrow="TEMPLATE / QUALITY CHECK" title="先看问题，再做决定" description="阻断、警告与提示各有边界。人工标记不会自动解除实际问题。"><button class="secondary" @click="exportQuality(result.issues)">导出质检报告</button><button @click="next">下一步：标准矢量 →</button></PageHeader><div v-if="mapping.problems.length" class="notice">映射还有 {{mapping.problems.length}} 项未确认，当前为临时质检结果。<RouterLink :to="task.path('mapping')">返回确认 →</RouterLink></div><div class="stats-grid"><StatCard label="阻断" :value="count('block')" detail="影响有效导入" tone="danger"/><StatCard label="警告" :value="count('warn')" detail="需要核对已有数据"/><StatCard label="提示" :value="count('info')" detail="待确认缺失，不阻断"/><StatCard label="问题总数" :value="result.issues.length" detail="按问题计数，不等于地块数"/></div><section class="panel"><div class="filters"><select v-model="level" aria-label="质检级别"><option value="">全部级别</option><option value="block">阻断</option><option value="warn">警告</option><option value="info">提示</option></select><select v-model="type" aria-label="问题类型"><option value="">全部类型</option><option v-for="t in [...new Set(result.issues.map(q=>q.type))]" :key="t">{{t}}</option></select><input v-model="search" placeholder="搜索地块编码" aria-label="搜索地块编码"><button class="secondary small" @click="level='block'">仅看阻断</button></div><QualityTable :issues="filtered" @locate="locate=$event" @edit="edit=$event" @acknowledge="result.acknowledge"/></section><ConfirmDialog v-if="confirm" title="仍有阻断问题，继续预览？" message="可以继续检查当前模板结果；模拟上传时，有阻断的行仍会失败。" @cancel="confirm=false" @confirm="router.push(task.path('vector-result'))"/><div v-if="locate" class="modal-backdrop" @click.self="locate=''"><section class="modal map-modal"><div class="section-heading"><h2>定位 {{locate}}</h2><button class="secondary" @click="locate=''">关闭</button></div><MapPreview :geojson="task.plots" :highlight-row-id="locate"/></section></div><RowDetailDrawer v-if="edit" :row-id="edit" @close="edit=''"/></template>
