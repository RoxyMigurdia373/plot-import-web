<script setup lang="ts">
import { computed,ref } from 'vue'
import { useRouter } from 'vue-router'
import { useResultStore } from '../stores/resultStore'
import PageHeader from '../components/layout/PageHeader.vue'
import MappingTable from '../components/mapping/MappingTable.vue'
import Toast from '../components/common/Toast.vue'
import { useTaskStore } from '../stores/taskStore'
import { useMappingStore } from '../stores/mappingStore'
import { useFieldLevelStore } from '../stores/fieldLevelStore'
import { activeTarget } from '../services/transform'
const router=useRouter(),result=useResultStore(),message=ref('')
function generate(){try{result.generateVector();router.push(task.path('vector-result'))}catch(e){message.value=String(e)}}
const task=useTaskStore(),mapping=useMappingStore(),fields=useFieldLevelStore(),search=ref('')
const missing=computed(()=>fields.levels.filter(f=>!mapping.suggestions.some(m=>activeTarget(m)===f.key)&&!f.derivable&&!(f.defaultable&&f.defaultValue!==null)))
const columns=computed(()=>task.template?.columns.filter(c=>`${c.header} ${c.key}`.includes(search.value))||[])
</script>
<template><PageHeader eyebrow="VECTOR / MAPPING" :title="`${task.profile.name} · 矢量字段映射`" description="先将原始属性转换为模板同名字段。所有表头都保留，没有来源且未配置默认值的字段输出 null。"><button :disabled="mapping.problems.length>0" @click="generate">生成标准矢量 →</button></PageHeader><div class="notice" v-if="mapping.problems.length"><strong>{{mapping.problems.length}} 项需要处理</strong><span> · {{mapping.problems.join('；')}}</span></div><div v-else class="notice success-notice">映射确认已完成，可以生成字段完整的标准矢量。</div><Toast :message="message || mapping.notice"/><section class="panel"><div class="section-heading"><h2>原始字段 → 标准字段</h2><span class="badge neutral">人工确认后即时保存</span></div><MappingTable :suggestions="mapping.suggestions" :columns="task.template?.columns||[]" :raw-fields="task.rawFields" @update="mapping.update"/></section><div class="two-column"><section class="panel"><div class="section-heading"><h2>将补齐的空字段</h2><span>{{missing.length}} 项</span></div><div class="field-chip-list"><div v-for="f in missing" :key="f.key"><span>{{f.field}}</span><small>字段名保留 · 输出 null · {{f.manualFill?'可人工补':'可后续补充'}}</small></div></div></section><section class="panel"><h2>目标字段字典</h2><input v-model="search" class="full-width" placeholder="搜索目标字段" aria-label="搜索目标字段"><div class="dictionary-list"><div v-for="c in columns" :key="c.key"><strong>{{c.header}}</strong><small class="mono">{{c.key}} · {{c.dataType}}</small></div></div></section></div></template>
