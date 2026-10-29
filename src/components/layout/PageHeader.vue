<script setup lang="ts">defineProps<{eyebrow?:string;title:string;description:string}>()</script>
<template><div class="page-heading"><div><h1>{{title}}</h1><p class="subtitle">{{description}}</p></div><div class="header-actions"><slot/></div></div></template>
