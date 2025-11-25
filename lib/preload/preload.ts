import { contextBridge } from 'electron'
import { conveyor } from '@/lib/conveyor/api'

console.log('[Preload] Conveyor API initialized:', Object.keys(conveyor))
console.log('[Preload] Spider methods:', Object.keys(conveyor.spider))

// Use `contextBridge` APIs to expose APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('conveyor', conveyor)
    console.log('[Preload] Conveyor exposed to main world')
  } catch (error) {
    console.error('[Preload] Failed to expose conveyor:', error)
  }
} else {
  window.conveyor = conveyor
  console.log('[Preload] Conveyor added to window (no context isolation)')
}
