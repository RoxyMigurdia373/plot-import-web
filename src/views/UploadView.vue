<script setup lang="ts">
import { ref } from 'vue'
import PageHeader from '../components/layout/PageHeader.vue'
import DropZone from '../components/upload/DropZone.vue'
import MapPreview from '../components/map/MapPreview.vue'
import DataTable from '../components/table/DataTable.vue'
import Toast from '../components/common/Toast.vue'
import { useTaskStore } from '../stores/taskStore'
const task=useTaskStore(),message=ref(''),highlight=ref('');async function reload(){try{await task.load();message.value='已重新加载 5 个合成地块'}catch(e){message.value=String(e)}}
</script>
<template><PageHeader eyebrow="STEP 01 / UPLOAD" title="上传原始矢量" description="一次加载矢量，三个功能共用同一份原始属性和几何，各自完成映射与导表。"><RouterLink class="button" to="/functions">下一步：选择处理功能 →</RouterLink></PageHeader><div class="two-column"><section class="panel"><div class="section-heading"><h2>选择数据</h2><span class="badge neutral">演示模式</span></div><DropZone/><button class="full-width secondary" @click="reload" :disabled="task.loading">加载 mock 矢量</button><Toast :message="message"/><dl class="task-meta"><div><dt>当前数据</dt><dd>{{task.task?.fileName}}</dd></div><div><dt>坐标参考</dt><dd>{{task.task?.crs}}</dd></div><div><dt>要素数量</dt><dd>{{task.plots.features.length}} 个地块</dd></div><div><dt>数据性质</dt><dd>明确标注的合成示例</dd></div></dl></section><section class="panel map-panel"><div class="section-heading"><h2>地块空间预览</h2><span class="badge success">GeoJSON</span></div><MapPreview :geojson="task.plots" :highlight-row-id="highlight" @select="highlight=$event"/></section></div><section class="panel"><div class="section-heading"><h2>原始字段清单</h2><span class="muted">{{task.rawFields.length}} 个属性字段</span></div><DataTable :columns="[{key:'name',label:'字段名称'},{key:'alias',label:'字段别名'},{key:'type',label:'数据类型'},{key:'sample',label:'样例值'}]" :rows="task.rawFields.map(f=>({...f}))" @select="message=`${$event.name}：${$event.alias}，类型 ${$event.type}`"/></section></template>
