<script setup lang="ts">
import { computed,ref,watch } from 'vue'
const props=withDefaults(defineProps<{columns:{key:string;label:string}[];rows:Record<string,unknown>[];pageSize?:number}>(),{pageSize:10})
defineEmits<{select:[row:Record<string,unknown>]}>()
const page=ref(1),sort=ref(''),ascending=ref(true),hidden=ref<string[]>([])
const visibleCols=computed(()=>props.columns.filter(c=>!hidden.value.includes(c.key)))
const sorted=computed(()=>{const rows=[...props.rows];return sort.value?rows.sort((a,b)=>String(a[sort.value]??'').localeCompare(String(b[sort.value]??''),'zh-CN',{numeric:true})*(ascending.value?1:-1)):rows})
const totalPages=computed(()=>Math.max(1,Math.ceil(props.rows.length/props.pageSize)))
const display=computed(()=>sorted.value.slice((page.value-1)*props.pageSize,page.value*props.pageSize))
watch(()=>props.rows,()=>{page.value=Math.min(page.value,totalPages.value)})
function toggleSort(key:string){ascending.value=sort.value===key?!ascending.value:true;sort.value=key}
</script>
<template><div class="table-controls"><span>{{rows.length}} 条记录</span><details><summary>显示列</summary><div class="column-menu"><label v-for="c in columns" :key="c.key"><input type="checkbox" :checked="!hidden.includes(c.key)" @change="hidden=hidden.includes(c.key)?hidden.filter(k=>k!==c.key):[...hidden,c.key]">{{c.label}}</label></div></details></div><div class="table-scroll"><table><thead><tr><th v-for="c in visibleCols" :key="c.key"><button class="th-button" @click="toggleSort(c.key)">{{c.label}} <span>{{sort===c.key?(ascending?'↑':'↓'):'↕'}}</span></button></th><th>详情</th></tr></thead><tbody><tr v-for="(row,i) in display" :key="String(row.rowId??i)"><td v-for="c in visibleCols" :key="c.key"><slot :name="`cell-${c.key}`" :row="row" :value="row[c.key]"><span class="cell-text" :title="String(row[c.key]??'')">{{row[c.key]===null||row[c.key]===undefined||row[c.key]===''?'—':row[c.key]}}</span></slot></td><td><button class="text-button" @click="$emit('select',row)">查看</button></td></tr><tr v-if="!display.length"><td :colspan="visibleCols.length+1" class="empty">暂无记录</td></tr></tbody></table></div><div class="pagination"><span>第 {{page}} / {{totalPages}} 页</span><button class="secondary small" :disabled="page<=1" @click="page--">上一页</button><button class="secondary small" :disabled="page>=totalPages" @click="page++">下一页</button></div></template>
