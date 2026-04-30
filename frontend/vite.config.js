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
  build: {
    rolldownOptions: {
      output: {
        codeSplitting: {
          groups: [
            // React 런타임과 라우터를 공용 청크로 분리해 라우트별 화면 청크 크기를 낮춥니다.
            { name: 'react-vendor', test: /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router-dom)[\\/]/ },
            // Recharts와 차트 의존성을 대시보드 화면 코드에서 분리합니다.
            { name: 'charts-vendor', test: /[\\/]node_modules[\\/](recharts|d3-|react-is|lodash-es)[\\/]/ },
            // xterm 터미널 라이브러리를 별도 청크로 분리해 터미널 탭 로딩 비용을 격리합니다.
            { name: 'terminal-vendor', test: /[\\/]node_modules[\\/](@xterm|xterm)[\\/]/ },
            // SockJS/STOMP 브라우저 클라이언트를 WebSocket 전용 청크로 분리합니다.
            { name: 'stomp-vendor', test: /[\\/]node_modules[\\/](@stomp|sockjs-client)[\\/]/ },
          ],
        },
      },
    },
  },
})
