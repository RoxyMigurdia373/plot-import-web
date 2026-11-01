<script setup lang="ts">
import { ref,watch } from 'vue'
const props=defineProps<{open:boolean;title:string;name:string;description?:string;hint?:string;confirmText?:string}>()
const emit=defineEmits<{(e:'cancel'):void;(e:'save',payload:{name:string;description:string}):void}>()
const name=ref(props.name),description=ref(props.description||''),error=ref('')
watch(()=>props.open,(open)=>{if(open){name.value=props.name;description.value=props.description||'';error.value=''}})
function submit(){const clean=name.value.trim();if(!clean){error.value='请填写模板名称';return}emit('save',{name:clean,description:description.value.trim()})}
</script>
<template><div v-if="open" class="modal-backdrop" @click.self="emit('cancel')"><section class="modal"><div class="section-heading"><h2>{{title}}</h2><button class="secondary" @click="emit('cancel')">取消</button></div><label class="dialog-field">模板名称<input v-model="name" class="dialog-input" maxlength="60" placeholder="例如：某公司上传模板 / 2026 年耕地摸底" @keyup.enter="submit" /><small v-if="hint" class="hint">{{hint}}</small></label><label class="dialog-field">用途说明（可选）<input v-model="description" class="dialog-input" maxlength="120" placeholder="例如：按 XX 平台 2026 版表头上报" @keyup.enter="submit" /></label><p v-if="error" class="notice">{{error}}</p><div class="button-row"><button class="secondary" @click="emit('cancel')">取消</button><button @click="submit">{{confirmText||'保存模板'}}</button></div></section></div></template>
