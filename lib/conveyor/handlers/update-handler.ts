import { handle } from '@/lib/main/shared'
import { updateManager } from '@/lib/main/updater/update-manager'

export const registerUpdateHandlers = () => {
  handle('updater:check', async () => {
    return await updateManager.checkForUpdates()
  })

  handle('updater:download', async () => {
    await updateManager.downloadUpdate()
  })

  handle('updater:install', () => {
    updateManager.installUpdate()
  })

  handle('updater:get-status', () => {
    return updateManager.getState()
  })
}
