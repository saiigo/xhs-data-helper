import { ConveyorApi } from '@/lib/preload/shared'
import type { z } from 'zod'
import type { updateStateSchema } from '@/lib/conveyor/schemas/update-schema'

export type UpdateState = z.infer<typeof updateStateSchema>
export type UpdateStatusCallback = (state: UpdateState) => void

export class UpdateApi extends ConveyorApi {
  check = () => this.invoke('updater:check')
  download = () => this.invoke('updater:download')
  install = () => this.invoke('updater:install')
  getStatus = () => this.invoke('updater:get-status')

  onStatusChange = (callback: UpdateStatusCallback): (() => void) => {
    const handler = (_event: unknown, state: UpdateState) => callback(state)
    this.renderer.on('updater:status', handler)
    return () => this.renderer.removeListener('updater:status', handler)
  }
}
