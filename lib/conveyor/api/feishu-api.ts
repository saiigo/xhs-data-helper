import { electronAPI } from '@electron-toolkit/preload'

export class FeishuApi {
  constructor(private api: typeof electronAPI) {}

  /**
   * 获取飞书API配置
   */
  getConfig = async (): Promise<any> => {
    return await this.api.ipcRenderer.invoke('feishu:getConfig')
  }

  /**
   * 设置飞书API配置
   */
  setConfig = async (config: {
    appId: string
    appSecret: string
    readInterval: number
  }): Promise<any> => {
    return await this.api.ipcRenderer.invoke('feishu:setConfig', config)
  }

  /**
   * 从飞书表格读取数据
   */
  fetchTableData = async (tableUrl: string): Promise<any> => {
    return await this.api.ipcRenderer.invoke('feishu:fetchTableData', tableUrl)
  }

  /**
   * 读取博主笔记列表
   */
  fetchBloggerNotes = async (bloggerId: string, shareUrl?: string, tableUrl?: string): Promise<any> => {
    return await this.api.ipcRenderer.invoke('feishu:fetchBloggerNotes', bloggerId, shareUrl, tableUrl)
  }

  /**
   * 读取笔记详情信息
   */
  fetchNoteDetail = async (noteId: string): Promise<any> => {
    return await this.api.ipcRenderer.invoke('feishu:fetchNoteDetail', noteId)
  }

  /**
   * 生成Excel表格
   */
  generateExcel = async (bloggerData: Array<{
    bloggerId: string
    shareUrl: string
    notes: Array<any>
    noteCount?: number
    user?: any
    tags?: Array<string>
  }>): Promise<any> => {
    return await this.api.ipcRenderer.invoke('feishu:generateExcel', bloggerData)
  }

  /**
   * 写入数据到飞书表格
   */
  writeTableData = async (tableUrl: string, bloggerData: Array<{
    bloggerId: string
    shareUrl: string
    notes: Array<any>
    noteCount?: number
    user?: any
    tags?: Array<string>
  }>): Promise<any> => {
    return await this.api.ipcRenderer.invoke('feishu:writeTableData', tableUrl, bloggerData)
  }

  /**
   * 从本地Excel文件解析博主汇总数据
   */
  loadExcelSummary = async (filePath: string): Promise<{ success: boolean; data?: Array<{ bloggerId: string; shareUrl: string; notes: Array<any>; user?: any; tags?: Array<string> }>; error?: string }> => {
    return await this.api.ipcRenderer.invoke('feishu:loadExcelSummary', filePath)
  }

  /**
   * 读取飞书表格的汇总信息，获取博主的笔记数
   */
  readSummaryInfo = async (tableUrl: string): Promise<{ success: boolean; data?: Array<{ bloggerId: string; noteCount: number }>; error?: string }> => {
    return await this.api.ipcRenderer.invoke('feishu:readSummaryInfo', tableUrl)
  }
}
