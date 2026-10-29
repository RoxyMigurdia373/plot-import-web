<script setup lang="ts">defineProps<{label:string;value:number|string;detail?:string;tone?:string}>()</script>
<template><div class="stat-card" :class="tone"><div class="stat-label">{{label}}</div><div class="stat-value">{{value}}<span v-if="typeof value==='number'">项</span></div><div class="stat-detail">{{detail}}</div></div></template>
