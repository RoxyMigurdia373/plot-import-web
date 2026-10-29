<script setup lang="ts">
import { computed,ref } from 'vue'
import PageHeader from '../components/layout/PageHeader.vue'
import DataTable from '../components/table/DataTable.vue'
import Toast from '../components/common/Toast.vue'
import RowDetailDrawer from '../components/table/RowDetailDrawer.vue'
import { useTaskStore } from '../stores/taskStore'
import { useResultStore } from '../stores/resultStore'
import type { FieldGroup } from '../types'
const task=useTaskStore(),result=useResultStore(),group=ref<FieldGroup>('basic'),message=ref(''),selected=ref('')
const columns=computed(()=>{const c=task.template?.columns.filter(c=>c.group===group.value).map(c=>({key:c.key,label:c.header}))||[];if(!c.some(c=>c.key==='plot_code'))c.unshift({key:'plot_code',label:'地块编码'});return c})
function check(){message.value=result.joined.errors.length?result.joined.errors.join('；'):`关联检查通过：${result.rows.length} 个地块，三表键唯一且对应完整`}
</script>
<template><PageHeader eyebrow="STEP 05 / NORMALIZED TABLES" title="全量地块 · 内部分组预览" description="按 plot_code 关联基本、确权与扩展信息，点击详情查看来源或人工补充。"><button class="secondary" @click="check">关联检查</button><RouterLink class="button" :to="task.path('wide-table')">下一步：宽表预览 →</RouterLink></PageHeader><Toast :message="message || result.notice"/><section class="panel"><div class="tabs" role="tablist"><button v-for="(label,key) in {basic:'基本信息',confirm:'确权信息',ext:'扩展信息'}" :key="key" role="tab" :aria-selected="group===key" :class="{selected:group===key}" @click="group=key as FieldGroup">{{label}} <span>{{result.tables[key as FieldGroup].length}}</span></button></div><DataTable :columns="columns" :rows="result.tables[group]" @select="selected=String($event.rowId)"/></section><p class="hint">确权信息缺失保留空值，不根据姓名、地块位置或用途生成。每张表保留稳定行标识，避免重复编码导致静默覆盖。</p><RowDetailDrawer v-if="selected" :row-id="selected" @close="selected=''"/></template>
