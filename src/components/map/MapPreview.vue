<script setup lang="ts">
import L from 'leaflet'
import { onMounted,onBeforeUnmount,ref,watch } from 'vue'
import type { PlotCollection } from '../../types'
const props=defineProps<{geojson:PlotCollection;highlightRowId?:string}>();const emit=defineEmits<{select:[rowId:string]}>();const element=ref<HTMLElement>();let map:L.Map|undefined,layer:L.GeoJSON|undefined;let resizeTimer:ReturnType<typeof setTimeout>|undefined
function draw(){if(!map)return;layer?.remove();layer=L.geoJSON(props.geojson as GeoJSON.GeoJsonObject,{style:f=>({color:f?.properties.rowId===props.highlightRowId?'#e6a440':'#427c61',weight:f?.properties.rowId===props.highlightRowId?3:2,fillColor:f?.properties.rowId===props.highlightRowId?'#e6a440':'#7caa7a',fillOpacity:.35}),onEachFeature:(f,l)=>{const el=document.createElement('div');el.textContent=`${f.properties.TBBH || f.properties.rowId} · 地块`;l.bindTooltip(el);l.on('click',()=>emit('select',f.properties.rowId))}}).addTo(map);if(layer.getBounds().isValid())map.fitBounds(layer.getBounds(),{padding:[35,35]})}
onMounted(()=>{map=L.map(element.value!,{zoomControl:true,attributionControl:false,zoomAnimation:false,fadeAnimation:false});draw();resizeTimer=setTimeout(()=>map?.invalidateSize(),100)});watch(()=>[props.geojson,props.highlightRowId],draw,{deep:true});onBeforeUnmount(()=>{clearTimeout(resizeTimer);map?.stop();map?.remove();map=undefined;layer=undefined})
</script>
<template><div class="map-wrapper"><div ref="element" class="map-canvas" aria-label="地块预览地图"></div><div class="map-label"><span class="dot"></span> 本地矢量预览 <span>WGS 84</span></div><div class="map-legend"><span class="legend-square"></span> 地块 <small>无在线底图 · 经纬度坐标</small></div></div></template>
