import { electronAPI } from '@electron-toolkit/preload'
import { AppApi } from './app-api'
import { WindowApi } from './window-api'
import { SpiderApi } from './spider-api'
import { UpdateApi } from './update-api'

export const conveyor = {
  app: new AppApi(electronAPI),
  window: new WindowApi(electronAPI),
  spider: new SpiderApi(electronAPI),
  updater: new UpdateApi(electronAPI),
}

export type ConveyorApi = typeof conveyor
