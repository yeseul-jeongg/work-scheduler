import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // 엑셀 라이브러리(ExcelJS)는 다운로드 버튼을 누를 때만 불러와서 커도 괜찮아요
  build: { chunkSizeWarningLimit: 1000 },
})
