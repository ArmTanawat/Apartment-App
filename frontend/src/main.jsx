import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import CapturePage from './pages/CapturePage.jsx'
import { DataProvider } from './state/DataContext.jsx'
import { UiProvider } from './state/UiContext.jsx'
import './styles/fonts.css'
import './styles/app.css'

// ?capture=bills&period=2026-10 is the page the desktop shell photographs for
// Export เป็นรูปภาพ (electron/export.js). It skips the chooser and the rail:
// the building is whichever one the server has open, which is the one the
// window that asked for the export is showing.
const query = new URLSearchParams(window.location.search)
const capture = query.get('capture')
const period = query.get('period')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {(capture === 'bills' || capture === 'receipts') && /^\d{4}-\d{2}$/.test(period || '')
      ? <UiProvider><DataProvider><CapturePage kind={capture} period={period} /></DataProvider></UiProvider>
      : <App />}
  </StrictMode>,
)
