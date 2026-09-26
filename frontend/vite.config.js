import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Every path the Express server answers on. In the packaged app it serves the
// pages as well, so these are same-origin; in development Vite serves the
// pages and hands these through, which is what lets the app use relative
// paths in both.
//
// This list is the mount points in backend/server.js. A new router needs a
// line here too, or it will 404 in development and work when packaged, which
// is the worst way round to find out.
const API_PATHS = ['/units', '/tenants', '/leases', '/readings',
                   '/fees', '/bills', '/receipts', '/settings', '/backups', '/health'];

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: Object.fromEntries(
      API_PATHS.map(p => [p, { target: 'http://127.0.0.1:3001' }])),
  },
})
