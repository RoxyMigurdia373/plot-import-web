import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'
export default defineConfig(({ mode }) => ({ plugins: [vue(), tailwindcss()], base: loadEnv(mode, process.cwd(), '').VITE_BASE_PATH || '/' }))
