import { autoUpdater, type UpdateInfo, type ProgressInfo } from 'electron-updater'
import { BrowserWindow } from 'electron'

export type UpdateStatus =
  | 'idle'
  | 'checking'
  | 'available'
  | 'not-available'
  | 'downloading'
  | 'downloaded'
  | 'error'

export interface UpdateState {
  status: UpdateStatus
  info: UpdateInfo | null
  progress: ProgressInfo | null
  error: string | null
}

class UpdateManager {
  private mainWindow: BrowserWindow | null = null
  private state: UpdateState = {
    status: 'idle',
    info: null,
    progress: null,
    error: null,
  }

  init(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow

    // Disable auto download - user must explicitly request
    autoUpdater.autoDownload = false
    autoUpdater.autoInstallOnAppQuit = true

    // Set up event handlers
    autoUpdater.on('checking-for-update', () => {
      this.updateState({ status: 'checking', error: null })
    })

    autoUpdater.on('update-available', (info: UpdateInfo) => {
      this.updateState({ status: 'available', info })
    })

    autoUpdater.on('update-not-available', (info: UpdateInfo) => {
      this.updateState({ status: 'not-available', info })
    })

    autoUpdater.on('download-progress', (progress: ProgressInfo) => {
      this.updateState({ status: 'downloading', progress })
    })

    autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
      this.updateState({ status: 'downloaded', info })
    })

    autoUpdater.on('error', (error: Error) => {
      this.updateState({ status: 'error', error: error.message })
    })

    // Check for updates on startup (after window is ready)
    mainWindow.once('ready-to-show', () => {
      this.checkForUpdates()
    })
  }

  private updateState(partial: Partial<UpdateState>) {
    this.state = { ...this.state, ...partial }
    this.sendStatusToRenderer()
  }

  private sendStatusToRenderer() {
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('updater:status', this.state)
    }
  }

  async checkForUpdates(): Promise<UpdateState> {
    try {
      await autoUpdater.checkForUpdates()
    } catch (error) {
      this.updateState({
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      })
    }
    return this.state
  }

  async downloadUpdate(): Promise<void> {
    if (this.state.status === 'available') {
      await autoUpdater.downloadUpdate()
    }
  }

  installUpdate(): void {
    if (this.state.status === 'downloaded') {
      autoUpdater.quitAndInstall()
    }
  }

  getState(): UpdateState {
    return this.state
  }
}

export const updateManager = new UpdateManager()
