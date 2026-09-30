import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
const target=process.env.SOCRATES_DEV_API_ORIGIN||'http://127.0.0.1:8000'
export default defineConfig({plugins:[react()],server:{host:'0.0.0.0',port:5173,strictPort:true,proxy:{'/api':{target,changeOrigin:true,ws:true}}},preview:{host:'0.0.0.0',port:4173,strictPort:true},build:{sourcemap:true},resolve:{extensions:['.mjs','.js','.jsx','.json','.ts','.tsx']}})
