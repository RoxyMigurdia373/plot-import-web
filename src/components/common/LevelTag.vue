<script setup lang="ts">import type {QualityLevel} from '../../types';defineProps<{level:QualityLevel}>()</script>
<template><span class="badge" :class="level">{{ {block:'阻断',warn:'警告',info:'提示'}[level] }}</span></template>
