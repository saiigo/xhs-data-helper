/**
 * Queue Manager
 * Manages task queue execution and scheduling
 */
import { databaseManager, QueueItem } from './database-manager'
import { pythonBridge, PythonMessage } from './python-bridge'
import { BrowserWindow } from 'electron'

type QueueStatus = 'idle' | 'running' | 'paused'

class QueueManager {
  private status: QueueStatus = 'idle'
  private currentQueueItem: QueueItem | null = null
  private mainWindow: BrowserWindow | null = null

  /**
   * Set main window for sending events
   */
  setMainWindow(window: BrowserWindow): void {
    this.mainWindow = window
  }

  /**
   * Get current queue status
   */
  getStatus(): QueueStatus {
    return this.status
  }

  /**
   * Get current queue item being processed
   */
  getCurrentQueueItem(): QueueItem | null {
    return this.currentQueueItem
  }

  /**
   * Start queue processing
   */
  async startQueue(): Promise<{ success: boolean; message: string }> {
    if (this.status === 'running') {
      return { success: false, message: 'Queue is already running' }
    }

    if (pythonBridge.isRunning()) {
      return { success: false, message: 'A task is currently running. Please wait for it to complete.' }
    }

    this.status = 'running'
    this.sendQueueStatusUpdate()

    // Process queue
    await this.processNextTask()

    return { success: true, message: 'Queue started' }
  }

  /**
   * Stop queue processing
   */
  async stopQueue(): Promise<{ success: boolean; message: string }> {
    if (this.status === 'idle') {
      return { success: false, message: 'Queue is not running' }
    }

    this.status = 'paused'

    // Stop current task if running
    if (pythonBridge.isRunning()) {
      await pythonBridge.stop()
    }

    // Mark current queue item as pending again
    if (this.currentQueueItem) {
      databaseManager.updateQueueItem(this.currentQueueItem.id, 'pending')
      this.currentQueueItem = null
    }

    this.sendQueueStatusUpdate()

    return { success: true, message: 'Queue stopped' }
  }

  /**
   * Process next task in queue
   */
  private async processNextTask(): Promise<void> {
    // Check if queue is still running
    if (this.status !== 'running') {
      return
    }

    // Get next pending task
    const nextItem = databaseManager.getNextQueueItem()

    if (!nextItem) {
      // Queue is empty, set to idle
      this.status = 'idle'
      this.currentQueueItem = null
      this.sendQueueStatusUpdate()
      return
    }

    // Parse task config
    const taskConfig = JSON.parse(nextItem.task_config)
    this.currentQueueItem = nextItem

    // Update queue item to running
    databaseManager.updateQueueItem(nextItem.id, 'running')
    this.sendQueueStatusUpdate()

    try {
      // Start the task
      const result = await this.executeTask(taskConfig)

      if (result.success) {
        // Mark as completed
        databaseManager.updateQueueItem(nextItem.id, 'completed', {
          taskId: result.taskId
        })
      } else {
        // Mark as failed
        databaseManager.updateQueueItem(nextItem.id, 'failed', {
          errorMessage: result.error || 'Task execution failed'
        })
      }
    } catch (error) {
      // Mark as failed
      databaseManager.updateQueueItem(nextItem.id, 'failed', {
        errorMessage: error instanceof Error ? error.message : 'Unknown error'
      })
    }

    // Clear current queue item
    this.currentQueueItem = null

    // Process next task after a short delay
    setTimeout(() => {
      this.processNextTask()
    }, 1000)
  }

  /**
   * Execute a single task
   */
  private async executeTask(taskConfig: {
    taskType: string
    params: any
    config?: any
  }): Promise<{ success: boolean; taskId?: number; error?: string }> {
    return new Promise((resolve) => {
      let taskId: number | null = null

      // Message handler
      const onMessage = (message: PythonMessage) => {
        // Get task ID from pythonBridge (created there)
        if (!taskId) {
          taskId = pythonBridge.getCurrentTaskId()
        }

        // Save log to database
        if (taskId) {
          databaseManager.addLog(taskId, message)
        }

        // Forward message to renderer
        if (this.mainWindow) {
          this.mainWindow.webContents.send('spider:message', message)
        }

        // Handle task completion
        if (message.type === 'done') {
          resolve({ success: true, taskId: taskId || undefined })
        } else if (message.type === 'error') {
          resolve({ success: false, error: message.message })
        }
      }

      // Start Python bridge
      try {
        // Transform queue task config to SpiderConfig format
        const spiderConfig = {
          taskType: taskConfig.taskType,
          params: taskConfig.params,
          cookie: taskConfig.config?.cookie,
          saveOptions: taskConfig.config?.saveOptions,
          paths: taskConfig.config?.paths,
          proxy: taskConfig.config?.proxy,
        }
        pythonBridge.start(spiderConfig as any, onMessage)
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error'
        resolve({ success: false, error: errorMessage })
      }
    })
  }

  /**
   * Send queue status update to renderer
   */
  private sendQueueStatusUpdate(): void {
    if (this.mainWindow) {
      const stats = databaseManager.getQueueStats()
      this.mainWindow.webContents.send('spider:queue:status', {
        status: this.status,
        currentItem: this.currentQueueItem,
        stats
      })
    }
  }

  /**
   * Add task to queue
   */
  addToQueue(taskConfig: { taskType: string; params: any; config?: any }, priority: number = 0): number {
    const queueId = databaseManager.addToQueue(taskConfig, priority)
    this.sendQueueStatusUpdate()
    return queueId
  }

  /**
   * Remove task from queue
   */
  removeFromQueue(queueId: number): void {
    // Don't allow removing current running task
    if (this.currentQueueItem && this.currentQueueItem.id === queueId) {
      throw new Error('Cannot remove currently running queue item')
    }

    databaseManager.deleteQueueItem(queueId)
    this.sendQueueStatusUpdate()
  }

  /**
   * Update queue item priority
   */
  updatePriority(queueId: number, priority: number): void {
    databaseManager.updateQueuePriority(queueId, priority)
    this.sendQueueStatusUpdate()
  }

  /**
   * Clear completed/failed items
   */
  clearCompleted(): void {
    databaseManager.clearCompletedQueue()
    this.sendQueueStatusUpdate()
  }

  /**
   * Get all queue items
   */
  getQueueItems(status?: QueueItem['status']): QueueItem[] {
    return databaseManager.getQueueItems(status)
  }

  /**
   * Get queue statistics
   */
  getStats(): { pending: number; running: number; completed: number; failed: number; total: number } {
    return databaseManager.getQueueStats()
  }
}

// Singleton instance
export const queueManager = new QueueManager()
