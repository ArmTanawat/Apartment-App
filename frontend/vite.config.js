import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// The backend runs on 3001, this on 5173, both on one machine.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
