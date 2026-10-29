<script setup lang="ts">
import { useRoute } from 'vue-router'
const route = useRoute()
const steps = [
  { path: '/', name: '上传原始矢量', no: '1' },
  { path: '/mapping', name: '映射与拓扑检查', no: '2' },
  { path: '/output', name: '矢量和表格成果', no: '3' },
]
</script>
<template>
  <div class="app-layout clean-layout">
    <div class="main-area">
      <header class="workspace-header">
        <span class="workspace-title">矢量转换与导出</span>
        <nav aria-label="处理流程" class="workflow-nav">
          <RouterLink v-for="step in steps" :key="step.path" :to="step.path"
            :class="{ active: route.path === step.path }" :aria-current="route.path === step.path ? 'step' : undefined">
            <span class="step-number">{{ step.no }}</span>{{ step.name }}
          </RouterLink>
        </nav>
      </header>
      <main><slot /></main>
    </div>
  </div>
</template>
