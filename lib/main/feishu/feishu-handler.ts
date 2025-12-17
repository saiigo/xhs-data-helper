import { ipcMain } from 'electron'
import { FeishuConfigManager } from './config-manager'
import * as XLSX from 'xlsx'
import { pythonBridge, SpiderConfig } from '../spider/python-bridge'

export class FeishuHandler {
  private configManager: FeishuConfigManager
  private tokenCache: {
    token: string;
    expireTime: number;
  } | null = null;

  constructor() {
    this.configManager = new FeishuConfigManager()
    this.registerHandlers()
  }

  /**
   * 检查token是否有效
   */
  private isTokenValid(): boolean {
    if (!this.tokenCache) {
      return false;
    }
    // 提前300秒过期，避免在使用时刚好过期
    return Date.now() < this.tokenCache.expireTime - 300 * 1000;
  }

  /**
   * 获取缓存的token或重新请求
   */
  private async getCachedAccessToken(appId: string, appSecret: string): Promise<string> {
    if (this.isTokenValid()) {
      console.log('使用缓存的飞书访问令牌：' + this.tokenCache!.token);
      return this.tokenCache!.token;
    }
    
    // 缓存无效，重新请求
    const token = await this.getFeishuAccessToken(appId, appSecret);
    return token;
  }

  private registerHandlers() {
    // 获取飞书API配置
    ipcMain.handle('feishu:getConfig', () => {
      return this.configManager.getConfig()
    })

    // 设置飞书API配置
    ipcMain.handle('feishu:setConfig', (event, config) => {
      console.log('feishu:setConfig事件被触发，事件对象:', event)
      console.log('接收到的配置类型:', typeof config)
      console.log('接收到的配置:', config)
      try {
        // 直接使用接收到的配置，不进行类型检查
        const result = this.configManager.setConfig(config)
        console.log('配置设置成功，返回结果:', result)
        return result
      } catch (error) {
        console.error('配置设置失败:', error)
        // 返回更详细的错误信息
        throw new Error(`配置设置失败: ${error instanceof Error ? error.message : String(error)}`)
      }
    })

    // 从飞书表格读取数据
    ipcMain.handle('feishu:fetchTableData', async (_, tableUrl: string) => {
      try {
        const config = this.configManager.getConfig()
        
        // 检查配置是否完整
        if (!config.appId || !config.appSecret) {
          return {
            success: false,
            error: '飞书API配置不完整，请先在设置中配置App ID和App Secret'
          }
        }
        
        console.log(`=== 开始从飞书表格读取数据 ===`)
        console.log(`表格链接: ${tableUrl}`)
        console.log(`使用配置: ${JSON.stringify(config, null, 2)}`)
        
        // 根据配置决定返回mock数据还是真实数据
        if (config.mockEnabled) {
          // 使用mock数据
          const testData = [
            {
              id: '1',
              bloggerId: '496704588',
              shareUrl: 'https://www.xiaohongshu.com/user/profile/59f8405811be103c5b76f21a?xsec_token=ABMeX4Jz7dFHuPYKJJxRpujwaWzh6WC5LTkbfes3h0PcQ=&xsec_source=pc_search'
            },
            {
              id: '2',
              bloggerId: '108483617',
              shareUrl: 'https://www.xiaohongshu.com/user/profile/5773f92882ec39756d3d039e?xsec_token=ABtSgCAeT1X4uh9FUFmM_X28ik7N3Unl9CTLjkHmB0tYQ=&xsec_source=pc_search'
            }
          ]
          
          console.log(`✓ 直接返回测试数据，共 ${testData.length} 条`)
          console.log(`=== 飞书表格数据读取完成 ===`)
          
          return {
            success: true,
            data: testData
          }
        } else {
          // 调用真实飞书API读取数据
          console.log(`✓ 调用真实飞书API读取数据`)
          
          // 获取飞书访问令牌（优先使用缓存）
          const accessToken = await this.getCachedAccessToken(config.appId, config.appSecret)
          
          // 解析飞书链接
          const { docId, sheetId, type } = this.parseFeishuDocUrl(tableUrl)
          
          // 调用飞书API读取表格数据
          const rawData = await this.fetchSheetData(accessToken, docId, sheetId, type)
          
          // 转换飞书表格数据为前端期望的格式
          const formattedData = this.formatFeishuData(rawData, type)
          
          console.log(`✓ 成功读取飞书表格数据，共 ${formattedData.length} 条`)
          console.log(`=== 飞书表格数据读取完成 ===`)
          
          return {
            success: true,
            data: formattedData
          }
        }
      } catch (error) {
        console.error('=== 读取飞书表格失败 ===')
        console.error('错误详情:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '读取飞书表格数据失败'
        }
      }
    })

    // 读取博主笔记列表
    ipcMain.handle('feishu:fetchBloggerNotes', async (_, bloggerId: string) => {
      try {
        console.log(`=== 开始读取博主 ${bloggerId} 的笔记列表 ===`)
        
        // 从配置管理器获取爬虫配置
        const config = await import('../spider/config-manager').then(m => m.configManager.getAll())
        console.log(`使用爬虫配置: ${JSON.stringify(config, null, 2)}`)
        
        // 构建爬虫配置对象
        const spiderConfig: SpiderConfig = {
          cookie: config.cookie,
          taskType: 'user',
          params: {
            userUrl: `https://www.xiaohongshu.com/user/profile/${bloggerId}`
          },
          saveOptions: {
            mode: 'excel',
            excelName: `博主_${bloggerId}_笔记`,
            download: false // 设置download参数为false，不下载媒体文件
          },
          paths: config.paths,
          proxy: config.proxy.enabled ? config.proxy.url : undefined
        }
        
        console.log(`构建爬虫配置: ${JSON.stringify(spiderConfig, null, 2)}`)
        
        // 调用爬虫API获取博主笔记列表
        // 使用Promise包装回调模式
        const notesResult = await new Promise<{ success: boolean; data?: any[]; error?: string }>((resolve) => {
          const notes: any[] = []
          
          // 启动爬虫任务
          pythonBridge.start(spiderConfig, (message) => {
            console.log(`爬虫消息: ${JSON.stringify(message)}`)
            
            if (message.type === 'media') {
              // 收集笔记媒体信息
              notes.push({
                id: message.noteId,
                title: message.title,
                // 其他信息需要从其他消息中获取
              })
            } else if (message.type === 'done') {
              // 任务完成，返回结果
              resolve({ success: true, data: notes })
            } else if (message.type === 'error') {
              // 任务失败
              resolve({ success: false, error: message.message || '爬虫任务失败' })
            }
          }).catch(error => {
            resolve({ success: false, error: error.message || '启动爬虫任务失败' })
          })
        })
        
        if (notesResult.success) {
          console.log(`✓ 成功读取博主 ${bloggerId} 的笔记列表，共 ${notesResult.data?.length || 0} 条笔记`)
          console.log(`=== 博主笔记列表读取完成 ===`)
          
          return {
            success: true,
            data: notesResult.data || []
          }
        } else {
          console.error(`=== 读取博主 ${bloggerId} 的笔记列表失败 ===`)
          console.error('错误详情:', notesResult.error)
          return {
            success: false,
            error: notesResult.error || '读取博主笔记列表失败'
          }
        }
      } catch (error) {
        console.error(`=== 读取博主 ${bloggerId} 的笔记列表失败 ===`)
        console.error('错误详情:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '读取博主笔记列表失败'
        }
      }
    })

    // 读取笔记详情信息
    ipcMain.handle('feishu:fetchNoteDetail', async (_, noteId: string) => {
      try {
        console.log(`=== 开始读取笔记 ${noteId} 的详情信息 ===`)
        
        // 这里应该调用真实的小红书API来读取笔记详情信息
        // 直接返回错误，因为真实API调用尚未实现
        const errorMessage = `读取笔记详情信息功能尚未实现`
        console.error(`✓ ${errorMessage}`)
        console.log(`=== 读取笔记 ${noteId} 的详情信息失败 ===`)
        
        return {
          success: false,
          error: errorMessage
        }
      } catch (error) {
        console.error(`=== 读取笔记 ${noteId} 的详情信息失败 ===`)
        console.error('错误详情:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '读取笔记详情信息失败'
        }
      }
    })

    // 生成Excel表格
    ipcMain.handle('feishu:generateExcel', async (_, bloggerData: Array<{
      bloggerId: string
      shareUrl: string
      notes: Array<any>
    }>) => {
      try {
        console.log(`=== 开始生成Excel表格 ===`)
        console.log(`共 ${bloggerData.length} 个博主数据需要处理`)
        
        // 创建Excel工作簿
        const workbook = XLSX.utils.book_new()
        
        // 为每个博主创建一个sheet
        for (const blogger of bloggerData) {
          console.log(`正在处理博主 ${blogger.bloggerId} 的数据，共 ${blogger.notes.length} 条笔记`)
          
          // 准备sheet名称，最多31个字符
          const sheetName = `博主_${blogger.bloggerId}`.substring(0, 31)
          
          // 准备笔记数据，转换为适合Excel的格式
          const notesData = blogger.notes.map(note => ({
            '笔记ID': note.id,
            '标题': note.title,
            '内容': note.content,
            '封面图片': note.coverImage,
            '发布时间': note.publishTime,
            '点赞数': note.likes,
            '评论数': note.comments,
            '分享数': note.shares,
            '浏览数': note.views,
            '标签': note.tags?.join(', ') || '',
            '作者ID': note.author?.id || '',
            '作者名称': note.author?.name || '',
            '作者头像': note.author?.avatar || ''
          }))
          
          // 如果没有笔记数据，跳过
          if (notesData.length === 0) {
            console.log(`博主 ${blogger.bloggerId} 没有笔记数据，跳过创建sheet`)
            continue
          }
          
          // 创建sheet
          const worksheet = XLSX.utils.json_to_sheet(notesData)
          
          // 添加sheet到工作簿
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
          
          console.log(`成功为博主 ${blogger.bloggerId} 创建sheet: ${sheetName}`)
        }
        
        // 生成文件路径
        const filePath = `/Users/sai/Desktop/feishu-notes-${Date.now()}.xlsx`
        
        // 写入Excel文件
        XLSX.writeFile(workbook, filePath)
        
        console.log(`✓ 成功生成Excel表格，保存路径: ${filePath}`)
        console.log(`=== Excel表格生成完成 ===`)
        
        return {
          success: true,
          filePath: filePath
        }
      } catch (error) {
        console.error(`=== 生成Excel表格失败 ===`)
        console.error('错误详情:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '生成Excel表格失败'
        }
      }
    })
    
    // 写入数据到飞书表格
    ipcMain.handle('feishu:writeTableData', async (_, tableUrl: string, bloggerData: Array<{
      bloggerId: string
      shareUrl: string
      notes: Array<any>
    }>) => {
      try {
        const config = this.configManager.getConfig()
        
        // 检查配置是否完整
        if (!config.appId || !config.appSecret) {
          return {
            success: false,
            error: '飞书API配置不完整，请先在设置中配置App ID和App Secret'
          }
        }
        
        console.log(`=== 开始写入飞书表格数据 ===`)
        console.log(`表格链接: ${tableUrl}`)
        console.log(`共 ${bloggerData.length} 个博主数据需要写入`)
        
        // 解析飞书链接
        const { docId, sheetId, type } = this.parseFeishuDocUrl(tableUrl)
        console.log(`解析结果 - 文档ID: ${docId}, 表格ID: ${sheetId}, 类型: ${type}`)
        
        // 检查是否为飞书多维表格
        if (type !== 'base') {
          return {
            success: false,
            error: '当前仅支持飞书多维表格写入'
          }
        }
        
        // 获取访问令牌
        const accessToken = await this.getCachedAccessToken(config.appId, config.appSecret)
        
        // 准备写入数据
        const records = bloggerData.map(blogger => ({
          fields: {
            '博主ID': blogger.bloggerId,
            '分享链接': blogger.shareUrl,
            '笔记数量': blogger.notes.length,
            '处理时间': new Date().toISOString()
          }
        }))
        
        console.log(`准备写入 ${records.length} 条记录`)
        
        // 调用飞书多维表格API写入数据（使用v3版本）
        // 使用真实的飞书多维表格API端点
        const writeUrl = `https://open.feishu.cn/open-apis/base/v3/bases/${docId}/tables/${sheetId}/records/batch_create`
        console.log('调用的API地址:', writeUrl)
        
        const response = await fetch(writeUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            records: records
          })
        })
        
        const responseText = await response.text()
        console.log('飞书写入API响应:', response.status, response.statusText, responseText)
        
        if (!response.ok) {
          throw new Error(`写入失败: ${response.status} ${response.statusText} - ${responseText}`)
        }
        
        const result = JSON.parse(responseText)
        
        console.log(`✓ 飞书表格数据写入成功`)
        console.log(`=== 飞书表格数据写入完成 ===`)
        
        return {
          success: true,
          data: result.data,
          message: `成功写入 ${records.length} 条数据到飞书表格`
        }
      } catch (error) {
        console.error(`=== 写入飞书表格失败 ===`)
        console.error('错误详情:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '写入飞书表格失败'
        }
      }
    })
  }

  /**
   * 获取飞书访问令牌
   */
  private async getFeishuAccessToken(appId: string, appSecret: string): Promise<string> {
    console.log('开始获取飞书访问令牌...')
    const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        app_id: appId,
        app_secret: appSecret
      })
    })
    
    const responseText = await response.text()
    console.log('飞书访问令牌API响应:', response.status, response.statusText, responseText)
    
    if (!response.ok) {
      throw new Error(`获取飞书访问令牌失败: ${response.status} ${response.statusText} - ${responseText}`)
    }
    
    const data = JSON.parse(responseText)
    if (!data.tenant_access_token) {
      throw new Error(`获取飞书访问令牌失败: 响应中没有包含访问令牌 - ${responseText}`)
    }
    
    // 缓存token
    const expireTime = Date.now() + (data.expire || 7200) * 1000;
    this.tokenCache = {
      token: data.tenant_access_token,
      expireTime: expireTime
    };
    
    console.log('成功获取飞书访问令牌，缓存有效期至:', new Date(expireTime).toLocaleString())
    return data.tenant_access_token
  }

  /**
   * 解析飞书链接，提取文档ID、表格ID和链接类型
   * 支持飞书文档表格和飞书多维表格
   */
  private parseFeishuDocUrl(url: string): { docId: string; sheetId: string; type: 'wiki' | 'base' } {
    console.log('开始解析飞书链接:', url)
    
    let docId: string
    let sheetId: string = ''
    let type: 'wiki' | 'base' = 'wiki'
    
    // 检查是否为飞书多维表格链接
    const baseMatch = url.match(/\/base\/(\w+)/)
    if (baseMatch) {
      // 飞书多维表格链接
      type = 'base'
      docId = baseMatch[1]
      console.log('提取到多维表格ID:', docId)
      
      // 提取表格ID (table参数) - 改进正则表达式，支持更多链接格式
      const tableMatch = url.match(/table=([^&?#]+)/)
      sheetId = tableMatch ? tableMatch[1] : ''
      console.log('提取到多维表格的工作表ID:', sheetId || '未指定，将尝试获取工作表列表')
      
      return { docId, sheetId, type }
    }
    
    // 检查是否为飞书文档表格链接
    const wikiMatch = url.match(/\/wiki\/(\w+)/)
    if (wikiMatch) {
      // 飞书文档表格链接
      type = 'wiki'
      docId = wikiMatch[1]
      console.log('提取到文档ID:', docId)
      
      // 提取表格ID (sheetId参数) - 改进正则表达式，支持更多链接格式
      const sheetIdMatch = url.match(/sheetId=([^&?#]+)/)
      sheetId = sheetIdMatch ? sheetIdMatch[1] : ''
      console.log('提取到表格ID:', sheetId || '未指定，将使用默认表格')
      
      return { docId, sheetId, type }
    }
    
    throw new Error(`无效的飞书链接，无法提取ID: ${url}`)
  }

  /**
   * 调用飞书API读取表格数据
   * 根据链接类型调用不同的API
   */
  private async fetchSheetData(accessToken: string, docId: string, sheetId: string, type: 'wiki' | 'base'): Promise<any> {
    console.log('开始调用飞书API读取表格数据...')
    console.log('链接类型:', type)
    
    if (type === 'base') {
      // 飞书多维表格API - 使用bitable API
      console.log('使用飞书多维表格Bitable API')
      
      // 使用docId作为app_token
      const appToken = docId
      console.log('使用app_token:', appToken)
      
      let tableId = sheetId
      
      // 如果没有提供tableId，尝试获取表格列表
      if (!tableId) {
        console.log('未指定工作表ID，尝试使用Bitable API获取表格列表...')
        // 使用用户要求的接口：/open-apis/bitable/v1/apps/:app_token/tables
        const tablesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables`
        console.log('调用的API地址:', tablesUrl)
        
        const tablesResponse = await fetch(tablesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })
        
        const tablesResponseText = await tablesResponse.text()
        console.log('获取工作表列表API响应:', tablesResponse.status, tablesResponse.statusText, tablesResponseText)
        
        if (!tablesResponse.ok) {
          throw new Error(`获取工作表列表失败: ${tablesResponse.status} ${tablesResponse.statusText} - ${tablesResponseText}`)
        }
        
        const tablesData = JSON.parse(tablesResponseText)
        if (tablesData?.data?.items?.length > 0) {
          tableId = tablesData.data.items[0].table_id
          console.log('获取到默认工作表ID:', tableId)
        } else {
          throw new Error('未找到任何工作表，请确保多维表格中存在至少一个工作表')
        }
      }
      
      // 使用用户要求的接口：/open-apis/bitable/v1/apps/:app_token/tables/:table_id/records/search
      const recordsUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records/search`
      console.log('调用的API地址:', recordsUrl)
      
      // bitable search接口需要POST请求
      const response = await fetch(recordsUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          page_size: 100
        })
      })
      
      const responseText = await response.text()
      console.log('飞书Bitable API响应:', response.status, response.statusText, responseText)
      
      if (!response.ok) {
        throw new Error(`读取多维表格数据失败: ${response.status} ${response.statusText} - ${responseText}`)
      }
      
      return JSON.parse(responseText)
    } else {
      // 飞书文档表格API
      console.log('使用飞书文档表格API')
      const sheetUrl = `https://open.feishu.cn/open-apis/sheets/v2/spreadsheets/${docId}/values/${sheetId || 'Sheet1'}!A1:C100`
      console.log('调用的API地址:', sheetUrl)
      
      const response = await fetch(sheetUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      const responseText = await response.text()
      console.log('飞书文档表格API响应:', response.status, response.statusText, responseText)
      
      if (!response.ok) {
        throw new Error(`读取文档表格数据失败: ${response.status} ${response.statusText} - ${responseText}`)
      }
      
      return JSON.parse(responseText)
    }
  }

  /**
   * 转换飞书表格数据为前端期望的格式
   * 支持飞书文档表格和飞书多维表格
   */
  private formatFeishuData(rawData: any, type: 'wiki' | 'base'): Array<{ id: string; bloggerId: string; shareUrl: string }> {
    console.log('=== 开始格式化飞书表格数据 ===')
    console.log('数据类型:', type)
    console.log('原始数据完整结构:', JSON.stringify(rawData, null, 2))
    
    if (type === 'base') {
      // 处理飞书多维表格数据
      console.log('处理飞书多维表格数据...')
      
      let records: any[] = []
      
      // 飞书多维表格API响应格式: { data: { items: [{ record_id: string, fields: {} }] } }
      if (rawData?.data?.items) {
        records = rawData.data.items
        console.log('从 data.items 提取到多维表格数据:', records)
      }
      
      if (records.length === 0) {
        console.log('没有提取到任何多维表格数据，返回空数组')
        return []
      }
      
      // 转换多维表格数据为前端期望的格式
      const formattedData = records.map((record: any, index: number) => {
        console.log(`处理第 ${index + 1} 条多维表格记录:`, record)
        
        // 提取字段值，支持不同的字段名
        const fields = record.fields || {}
        console.log('记录字段:', fields)
        
        // 辅助函数：提取字段值，支持嵌套对象格式
        const extractFieldValue = (field: any): string => {
          if (!field) return ''
          
          // 如果是对象，处理不同类型
          if (typeof field === 'object') {
            // 处理URL类型的字段，格式：{ link: string, text: string, type: 'url' }
            if (field.type === 'url' && (field.link || field.text)) {
              return field.link || field.text
            }
            // 其他对象类型，尝试转换为字符串
            try {
              return JSON.stringify(field)
            } catch {
              return String(field)
            }
          }
          
          // 直接转换为字符串
          return String(field)
        }
        
        // 尝试多种可能的字段名
        let bloggerId = ''
        let shareUrl = ''
        
        // 尝试中文字段名
        if (fields['博主ID']) bloggerId = extractFieldValue(fields['博主ID'])
        else if (fields['bloggerId']) bloggerId = extractFieldValue(fields['bloggerId'])
        else if (fields['博主id']) bloggerId = extractFieldValue(fields['博主id'])
        else if (fields['id']) bloggerId = extractFieldValue(fields['id'])
        
        if (fields['分享链接']) shareUrl = extractFieldValue(fields['分享链接'])
        else if (fields['shareUrl']) shareUrl = extractFieldValue(fields['shareUrl'])
        else if (fields['链接']) shareUrl = extractFieldValue(fields['链接'])
        else if (fields['url']) shareUrl = extractFieldValue(fields['url'])
        else if (fields['share_url']) shareUrl = extractFieldValue(fields['share_url'])
        
        console.log('提取到的博主ID:', bloggerId)
        console.log('提取到的分享链接:', shareUrl)
        
        return {
          id: (index + 1).toString(),
          bloggerId: bloggerId,
          shareUrl: shareUrl
        }
      }).filter(item => {
        const isValid = item.bloggerId && item.shareUrl
        if (!isValid) {
          console.log('过滤掉无效多维表格数据:', item)
        }
        return isValid
      })
      
      console.log('格式化后的多维表格数据:', formattedData)
      console.log('有效数据条数:', formattedData.length)
      console.log('=== 飞书多维表格数据格式化完成 ===')
      
      return formattedData
    } else {
      // 处理飞书文档表格数据
      console.log('处理飞书文档表格数据...')
      
      // 尝试多种可能的数据格式
      let values: any[][] = []
      
      // 格式1: { data: { valueRange: { values: [[]] } } }
      if (rawData?.data?.valueRange?.values) {
        values = rawData.data.valueRange.values
        console.log('从 data.valueRange.values 提取到数据:', values)
      }
      // 格式2: { data: { values: [[]] } }
      else if (rawData?.data?.values) {
        values = rawData.data.values
        console.log('从 data.values 提取到数据:', values)
      }
      // 格式3: { values: [[]] }
      else if (rawData?.values) {
        values = rawData.values
        console.log('从 values 提取到数据:', values)
      }
      // 格式4: { sheets: [{ data: { rows: [{ cells: [] }] } }] }
      else if (rawData?.data?.sheets?.[0]?.data?.rows) {
        const rows = rawData.data.sheets[0].data.rows
        values = rows.map((row: any) => row.cells.map((cell: any) => cell.value || ''))
        console.log('从 sheets[0].data.rows 提取并转换到数据:', values)
      }
      // 格式5: 直接是二维数组
      else if (Array.isArray(rawData) && rawData.every(row => Array.isArray(row))) {
        values = rawData
        console.log('直接使用原始数据作为二维数组:', values)
      }
      else {
        console.log('无法识别的文档表格数据格式，尝试提取所有可能的数组数据')
        // 尝试提取所有可能的数组数据
        const allValues = Object.values(rawData).filter(val => Array.isArray(val))
        if (allValues.length > 0) {
          values = allValues[0] as any[][] || []
          console.log('从原始数据中提取到可能的数组:', values)
        }
      }
      
      console.log('最终提取到的文档表格数据:', values)
      console.log('数据总行数:', values.length)
      
      if (values.length === 0) {
        console.log('没有提取到任何文档表格数据，返回空数组')
        return []
      }
      
      // 处理数据，支持两种情况：有表头和没有表头
      let dataRows: any[][] = []
      
      if (values.length >= 2) {
        // 假设第一行是表头，从第二行开始处理
        dataRows = values.slice(1)
        console.log('假设第一行是表头，数据行:', dataRows)
      } else {
        // 没有表头，直接使用所有行作为数据
        dataRows = values
        console.log('没有表头，直接使用所有行作为数据:', dataRows)
      }
      
      // 转换数据格式，支持不同的单元格数据结构
      const formattedData = dataRows.map((row: any[], index: number) => {
        console.log(`处理第 ${index + 1} 行文档表格数据:`, row)
        
        // 提取单元格数据，支持多种格式
        const extractCellValue = (cell: any): string => {
          if (!cell) return ''
          if (typeof cell === 'string') return cell
          if (cell.text) return cell.text
          if (cell.value) return cell.value
          return String(cell)
        }
        
        return {
          id: (index + 1).toString(),
          bloggerId: extractCellValue(row[0]),
          shareUrl: extractCellValue(row[1])
        }
      }).filter(item => {
        const isValid = item.bloggerId && item.shareUrl
        if (!isValid) {
          console.log('过滤掉无效文档表格数据:', item)
        }
        return isValid
      })
      
      console.log('格式化后的文档表格数据:', formattedData)
      console.log('有效数据行数:', formattedData.length)
      console.log('=== 飞书文档表格数据格式化完成 ===')
      
      // 如果没有有效数据，尝试直接返回原始数据的第一行（用于调试）
      if (formattedData.length === 0 && values.length > 0) {
        console.log('没有有效数据，尝试返回原始数据的第一行作为调试信息')
        return [{
          id: '1',
          bloggerId: '调试数据',
          shareUrl: JSON.stringify(values[0])
        }]
      }
      
      return formattedData
    }
  }
}
