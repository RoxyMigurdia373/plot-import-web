<script setup lang="ts">
import { ref,onMounted } from 'vue'
import AppShell from './components/layout/AppShell.vue'
import { useTaskStore } from './stores/taskStore'
const task=useTaskStore(),ready=ref(false),error=ref('')
async function init(){error.value='';try{await task.load();ready.value=true}catch(e){error.value=String(e)}}
onMounted(init)
</script>
<template><AppShell><RouterView v-if="ready"/><div v-else class="panel empty"><h2>{{error?'模板加载失败':'正在加载表格模板…'}}</h2><p>{{error}}</p><button v-if="error" @click="init">重试</button></div></AppShell></template>
