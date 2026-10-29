<script setup lang="ts">
import { ref } from 'vue'
const selected=ref(''),dragging=ref(false)
function choose(files:FileList|null){const f=files?.[0];if(f)selected.value=`${f.name} · ${(f.size/1024).toFixed(1)} KB（仅展示文件信息）`}
</script>
<template><label class="dropzone" :class="{dragging}" @dragover.prevent="dragging=true" @dragleave="dragging=false" @drop.prevent="dragging=false;choose($event.dataTransfer?.files || null)"><span class="upload-symbol">↥</span><strong>拖拽矢量文件到这里</strong><span>或点击选择文件</span><small>SHP / ZIP / GPKG / GeoJSON / KML / CAD</small><input type="file" @change="choose(($event.target as HTMLInputElement).files)"><p v-if="selected">{{selected}}</p></label><p class="hint">原型仅展示文件名与大小；地图和转换始终使用合成 mock。</p></template>
