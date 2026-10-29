<script setup lang="ts">
import { ref } from 'vue'
import PageHeader from '../components/layout/PageHeader.vue'
import StatCard from '../components/common/StatCard.vue'
import Toast from '../components/common/Toast.vue'
import { useTaskStore } from '../stores/taskStore'
import { useResultStore } from '../stores/resultStore'
import { exportRows } from '../utils/excel'
const task=useTaskStore(),result=useResultStore(),selected=ref<string[]>([]),message=ref('')
function download(){if(!result.upload||!task.template)return;const ids=selected.value.length?selected.value:result.upload.failedRows.map(r=>r.rowId);try{exportRows(result.upload.snapshot.filter(r=>ids.includes(r.rowId)),task.template,'single',`合成演示_${task.profile.name}_失败行_重传.xlsx`);message.value=`已按提交快照导出 ${ids.length} 条失败记录`}catch(e){message.value=String(e)}}
</script>
<template><PageHeader eyebrow="TEMPLATE / UPLOAD RECEIPT" title="上传结果，一行一行可追溯" description="本页展示本地模拟结果，没有向任何平台发送数据。"><RouterLink class="button secondary" :to="task.path('wide-table')">返回宽表</RouterLink></PageHeader><template v-if="result.upload"><div class="stats-grid three"><StatCard label="本次提交" :value="result.upload.total" detail="按地块行计数"/><StatCard label="模拟成功" :value="result.upload.success" detail="无阻断问题的行"/><StatCard label="模拟失败" :value="result.upload.failed" detail="按下方建议修改后重试" tone="danger"/></div><Toast :message="message"/><section class="panel"><div class="section-heading"><div><h2>失败记录</h2><p>选择部分行，或不勾选直接导出全部失败行。</p></div><button :disabled="!result.upload.failed" @click="download">重新导出失败行 ↓</button></div><div class="table-scroll"><table><thead><tr><th>选择</th><th>提交行号</th><th>地块编码</th><th>失败原因</th><th>修正建议</th></tr></thead><tbody><tr v-for="r in result.upload.failedRows" :key="r.rowId"><td><input v-model="selected" type="checkbox" :value="r.rowId" :aria-label="`选择 ${r.plotCode}`"></td><td>{{r.row}}</td><td class="mono">{{r.plotCode || r.rowId}}</td><td class="wrap">{{r.reason}}</td><td class="wrap">{{r.suggest}}</td></tr><tr v-if="!result.upload.failed"><td colspan="5" class="empty">本次模拟全部通过</td></tr></tbody></table></div></section><p class="hint">失败行导出使用提交时快照。之后的人工修改不会改变旧回执，请返回宽表重新模拟上传。</p></template><section v-else class="panel empty"><h2>还没有上传回执</h2><p>先完成映射确认，再到宽表页面执行“模拟上传”。刷新页面后需重新模拟。</p><RouterLink class="button" :to="task.path('wide-table')">前往宽表 →</RouterLink></section></template>
