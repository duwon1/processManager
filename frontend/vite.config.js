import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  define: {
    // [이유] sockjs-client가 사용하는 global 변수를 브라우저의 window로 매핑하여 에러 방지
    global: 'window',
  },
  server: {
    proxy: {
      // 일반 API 요청 프록시
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      // [이유] 웹소켓 전용 프록시 설정. ws: true가 있어야 실시간 통신이 끊기지 않음
      '/ws': {
        target: 'http://localhost:8080',
        ws: true,
        changeOrigin: true,
      }
    }
  },
})