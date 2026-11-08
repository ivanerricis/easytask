import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { getCurrentWindow } from '@tauri-apps/api/window'
import './index.css'
import App from './App.tsx'
import { getLanguage } from './lib/store/preferences'
import { flushStore } from './lib/store/save-soon'
import { runBeforeClose } from './lib/before-close'
import { isCloseToTrayActive } from './lib/tray'
import { initI18n } from './i18n'
import { prepareTheme } from './lib/theme-startup'
import { reportError } from './lib/report-error'
import { runAutoBackup } from './db/backup'
import { runTrashAutoEmpty } from './lib/trash-auto-empty'
import { scheduleStartupUpdateCheck } from './lib/updater'
import { installGlobalErrorHandlers } from './lib/global-error-handlers'
import { ErrorBoundary } from './components/error-boundary'

installGlobalErrorHandlers()

// Debounced preference saves must not be lost when the app closes
window.addEventListener('beforeunload', () => { void runBeforeClose(); void flushStore().catch(() => {}) })
try {
  void getCurrentWindow().onCloseRequested(async (event) => {
    await runBeforeClose(error => reportError(error))
    await flushStore().catch(error => reportError(error))
    // Close to the notification area: the window is hidden by useCloseToTray (src/lib/use-close-to-tray.ts), not destroyed
    if (isCloseToTrayActive()) event.preventDefault()
  }).catch(error => reportError(error))
} catch (e) {
  reportError(e)
}

// The stored language is applied before the first render so the UI never flashes in the wrong language
const start = async () => {
  // The theme is applied too (prepareTheme never throws): the first frame already has the right colors
  const [language] = await Promise.all([getLanguage().catch(() => 'system' as const), prepareTheme()])
  initI18n(language)
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  )
  // Daily backup, best effort: delayed so it does not compete with the first render
  setTimeout(() => { void runAutoBackup() }, 3000)
  setTimeout(() => { void runTrashAutoEmpty() }, 4000)
  scheduleStartupUpdateCheck()
}
void start()
