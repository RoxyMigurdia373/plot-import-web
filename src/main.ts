import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import './assets/main.css'
import 'leaflet/dist/leaflet.css'
import { initStreamlitBridge } from './streamlitBridge'
createApp(App).use(createPinia()).use(router).mount('#app')
initStreamlitBridge()
