import { ipcMain } from 'electron'
import { FeishuConfigManager } from './config-manager'
import * as XLSX from 'xlsx'
import * as fs from 'fs'
import * as path from 'path'
import { pythonBridge, SpiderConfig } from '../spider/python-bridge'

const toStringArray = (value: any): string[] => {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === 'string') return item
        try {
          return JSON.stringify(item)
        } catch {
          return String(item)
        }
      })
      .filter((item) => item)
  }
  if (typeof value === 'string') {
    return value
      .split(/[，,]/)
      .map((item) => item.trim())
      .filter((item) => item)
  }
  return [String(value)]
}

// 维护中英文字段对应关系
const fieldNameMapping: Record<string, string> = {
  // 博主信息汇总表字段
  '博主ID': 'blogger_id',
  '分享链接': 'share_url',
  '用户名': 'username',
  '头像URL': 'avatar_url',
  '小红书号': 'unique_id',
  '性别': 'gender',
  'IP地址': 'ip_location',
  '介绍': 'description',
  '关注数量': 'following_count',
  '粉丝数量': 'follower_count',
  '作品被赞数量': 'liked_count',
  '作品收藏数量': 'collected_count',
  '笔记数量': 'note_count',
  '处理时间': 'process_time',
  
  // 笔记详情表字段
  '笔记ID': 'note_id',
  '笔记链接': 'note_url',
  '笔记类型': 'note_type',
  '标题': 'title',
  '内容': 'content',
  '封面图片': 'cover_image',
  '视频地址': 'video_url',
  '图片列表': 'image_list',
  '发布时间': 'publish_time',
  '点赞数': 'liked_count',
  '收藏数': 'collected_count',
  '评论数': 'comment_count',
  '分享数': 'share_count',
  '浏览数': 'view_count',
  '标签': 'tags',
  '作者ID': 'author_id',
  '作者名称': 'author_name',
  '作者头像': 'author_avatar',
  'IP归属地': 'ip_location',
  '爬取时间': 'crawl_time'
}

// 获取中文字段名
const getChineseFieldName = (englishName: string): string => {
  return Object.keys(fieldNameMapping).find(key => fieldNameMapping[key] === englishName) || englishName
}

// 获取英文字段名
const getEnglishFieldName = (chineseName: string): string => {
  return fieldNameMapping[chineseName] || chineseName
}

const formatNoteForExcel = (note: any) => {
  const imageList = toStringArray(note?.image_list || note?.images || note?.imageList)
  const tags = toStringArray(note?.tags)
  const firstImage = imageList.length > 0 ? imageList[0] : (note?.cover_image || note?.coverImage || note?.cover || '')

  return {
    '笔记ID': note?.note_id || note?.id || '',
    '笔记链接': note?.note_url || note?.url || '',
    '笔记类型': note?.note_type || note?.type || '',
    '标题': note?.title || '',
    '内容': note?.desc || note?.content || '',
    '封面图片': note?.video_cover || note?.cover_image || firstImage || '',
    '视频地址': note?.video_addr || note?.videoUrl || note?.video_url || '',
    '图片列表': imageList.join(', '),
    '发布时间': note?.upload_time || note?.publishTime || note?.publish_time || '',
    '点赞数': note?.liked_count ?? note?.likes ?? '',
    '收藏数': note?.collected_count ?? note?.favorites ?? '',
    '评论数': note?.comment_count ?? note?.comments ?? '',
    '分享数': note?.share_count ?? note?.shares ?? '',
    '浏览数': note?.view_count ?? note?.views ?? '',
    '标签': tags.join(', '),
    '作者ID': note?.author_id || note?.user_id || note?.author?.id || '',
    '作者名称': note?.author_name || note?.nickname || note?.author?.name || '',
    '作者头像': note?.author_avatar || note?.avatar || note?.author?.avatar || '',
    'IP归属地': note?.ip_location || note?.ipLocation || '',
    '爬取时间': note?.crawl_time || note?.crawlTime || ''
  }
}

const formatNotesForExcel = (notes?: Array<any>) => {
  if (!Array.isArray(notes)) {
    return []
  }
  return notes.filter((note) => !!note).map((note) => formatNoteForExcel(note))
}

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
    ipcMain.handle('feishu:fetchBloggerNotes', async (_, bloggerId: string, shareUrl?: string) => {
      try {
        console.log(`=== 开始读取博主 ${bloggerId} 的笔记列表 ===`)
        console.log(`分享链接: ${shareUrl}`)
        
        // 从配置管理器获取爬虫配置
        const config = await import('../spider/config-manager').then(m => m.configManager.getAll())
        console.log(`使用爬虫配置: ${JSON.stringify(config, null, 2)}`)
        
        // 确定要使用的URL
        // 优先使用完整的分享链接（包含xsec_token和xsec_source）
        // 如果没有分享链接，使用基础URL
        const userUrl = shareUrl || `https://www.xiaohongshu.com/user/profile/${bloggerId}`
        
        // 构建爬虫配置对象
        const spiderConfig: SpiderConfig = {
          cookie: config.cookie,
          taskType: 'user',
          params: {
            userUrl: userUrl
          },
          saveOptions: {
            mode: 'excel',
            excelName: `博主_${bloggerId}_笔记`,
            download: false // 设置download参数为false，不下载媒体文件
          },
          paths: config.paths,
          proxy: config.proxy.enabled ? config.proxy.url : undefined,
          requestInterval: config.requestInterval // 添加请求间隔配置
        }
        
        console.log(`构建爬虫配置: ${JSON.stringify(spiderConfig, null, 2)}`)
        
        // 调用爬虫API获取博主笔记列表
        // 使用Promise包装回调模式
        const notesResult = await new Promise<{ success: boolean; data?: any[]; user?: any; error?: string }>((resolve) => {
          let allNotes: any[] = []
          let apiSuccess = true
          let apiMsg = ''
          let userInfo: any = null
          
          // 启动爬虫任务
          pythonBridge.start(spiderConfig, (message) => {
            console.log(`爬虫消息: ${JSON.stringify(message)}`)
            
            // 处理不同类型的消息
            switch (message.type) {
              case 'done':
                // 任务完成
                // 注意：这里的message.count表示爬取到的笔记数量
                // 实际的笔记数据可能已经通过log消息返回，或者需要通过其他方式获取
                // 我们需要区分任务是否成功
                apiSuccess = message.api_success ?? true
                apiMsg = message.api_message || ''
                if (message.notes && Array.isArray(message.notes)) {
                  allNotes = message.notes
                }
                if (message.user_info) {
                  userInfo = message.user_info
                }
                
                console.log(`任务完成，API成功: ${apiSuccess}, 消息: ${apiMsg}, 爬取到的笔记数量: ${message.count || 0}`)
                
                if (apiSuccess) {
                  // 如果API调用成功，返回结果
                  // 注意：对于用户笔记，实际的笔记URL列表会在log消息中输出
                  // 这里我们需要从log中提取，或者直接返回空数组，因为飞书功能主要依赖于下载功能
                  // 暂时返回空数组，后续可以改进
                  resolve({ success: true, data: allNotes, user: userInfo })
                } else {
                  // API调用失败
                  resolve({ success: false, error: apiMsg || '获取博主笔记失败' })
                }
                break
              
              case 'error':
                // 任务执行错误
                resolve({ success: false, error: message.message || '爬虫任务失败' })
                break
              
              case 'log':
                // 日志消息，可能包含有用的信息
                console.log(`日志: ${message.message}`)
                break
              
              case 'progress':
                // 进度消息，更新进度
                console.log(`进度: ${message.progress}%`)
                break
              
              default:
                // 其他类型的消息
                break
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
            data: notesResult.data || [],
            user: notesResult.user
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
      user?: {
        nickname?: string
        avatar?: string
        uniqueId?: string
        gender?: string
        ipLocation?: string
        desc?: string
        followingCount?: number
        followerCount?: number
        likedCount?: number
        collectedCount?: number
      }
      tags?: Array<string>
    }>) => {
      try {
        console.log(`=== 开始生成Excel表格 ===`)
        console.log(`共 ${bloggerData.length} 个博主数据需要处理`)
        
        // 创建Excel工作簿
        const workbook = XLSX.utils.book_new()

        const summaryTimestamp = new Date().toISOString()
        const summaryData = bloggerData.map((blogger) => ({
          '博主ID': blogger.bloggerId,
          '分享链接': blogger.shareUrl,
          '用户名': blogger.user?.nickname || '',
          '头像URL': blogger.user?.avatar || '',
          '小红书号': blogger.user?.uniqueId || '',
          '性别': blogger.user?.gender || '',
          'IP地址': blogger.user?.ipLocation || '',
          '介绍': blogger.user?.desc || '',
          '关注数量': blogger.user?.followingCount || 0,
          '粉丝数量': blogger.user?.followerCount || 0,
          '作品被赞数量': blogger.user?.likedCount || 0,
          '作品收藏数量': blogger.user?.collectedCount || 0,
          '标签': blogger.tags?.join(', ') || blogger.user?.tags?.join(', ') || '',
          '笔记数量': blogger.notes?.length || 0,
          '处理时间': summaryTimestamp
        }))

        if (summaryData.length > 0) {
          const summaryWorksheet = XLSX.utils.json_to_sheet(summaryData)
          XLSX.utils.book_append_sheet(workbook, summaryWorksheet, '博主信息汇总')
          console.log(`已添加博主信息汇总，共 ${summaryData.length} 条记录`)
        } else {
          const emptySheet = XLSX.utils.aoa_to_sheet([['提示', '暂无博主数据']])
          XLSX.utils.book_append_sheet(workbook, emptySheet, '博主信息汇总')
          console.log('没有可写入的博主数据，创建占位汇总sheet')
        }

        // 为每个博主创建一个sheet
        for (const blogger of bloggerData) {
          const noteCount = blogger.notes?.length || 0
          console.log(`正在处理博主 ${blogger.bloggerId} 的数据，共 ${noteCount} 条笔记`)
          
          const notesData = formatNotesForExcel(blogger.notes)
          if (notesData.length === 0) {
            console.log(`博主 ${blogger.bloggerId} 没有笔记数据，跳过创建sheet`)
            continue
          }
          
          // 准备sheet名称，最多31个字符
          const sheetName = `博主_${blogger.bloggerId}`.substring(0, 31)
          
          // 创建sheet
          const worksheet = XLSX.utils.json_to_sheet(notesData)
          
          // 添加sheet到工作簿
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
          
          console.log(`成功为博主 ${blogger.bloggerId} 创建sheet: ${sheetName}`)
        }
        
        // 生成文件路径 - 使用项目tmp-config目录
        const projectRoot = process.cwd()
        const basePath = path.join(projectRoot, 'tmp-config', 'excel_datas')
        if (!fs.existsSync(basePath)) {
          fs.mkdirSync(basePath, { recursive: true })
        }
        const filePath = `${basePath}/feishu-notes-${Date.now()}.xlsx`
        
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
      user?: {
        nickname?: string
        avatar?: string
        uniqueId?: string
        gender?: string
        ipLocation?: string
        desc?: string
        followingCount?: number
        followerCount?: number
        likedCount?: number
        collectedCount?: number
      }
      tags?: Array<string>
    }>) => {
      try {
        // 测试阶段：先将数据备份到本地Excel
        console.log(`=== 测试阶段：开始将数据备份到本地Excel ===`)
        
        // 创建Excel工作簿
        const workbook = XLSX.utils.book_new()
        
        // 添加博主信息汇总表
        const summaryTimestamp = new Date().toISOString()
        const bloggerSummaryData = bloggerData.map(blogger => ({
          '博主ID': blogger.bloggerId,
          '分享链接': blogger.shareUrl,
          '用户名': blogger.user?.nickname || '',
          '头像URL': blogger.user?.avatar || '',
          '小红书号': blogger.user?.uniqueId || '',
          '性别': blogger.user?.gender || '',
          'IP地址': blogger.user?.ipLocation || '',
          '介绍': blogger.user?.desc || '',
          '关注数量': blogger.user?.followingCount || 0,
          '粉丝数量': blogger.user?.followerCount || 0,
          '作品被赞数量': blogger.user?.likedCount || 0,
          '作品收藏数量': blogger.user?.collectedCount || 0,
          '标签': blogger.tags?.join(', ') || blogger.user?.tags?.join(', ') || '',
          '笔记数量': blogger.notes?.length || 0,
          '处理时间': summaryTimestamp
        }))
        
        // 创建汇总sheet
        const summaryWorksheet = XLSX.utils.json_to_sheet(bloggerSummaryData)
        XLSX.utils.book_append_sheet(workbook, summaryWorksheet, '博主信息汇总')
        
        // 为每个博主创建一个sheet
        for (const blogger of bloggerData) {
          // 准备sheet名称，最多31个字符
          const sheetName = `博主_${blogger.bloggerId}`.substring(0, 31)
          
          // 准备笔记数据，转换为适合Excel的格式
          const notesData = formatNotesForExcel(blogger.notes)
          
          if (notesData.length === 0) {
            console.log(`博主 ${blogger.bloggerId} 没有笔记数据，跳过创建sheet`)
            continue
          }
          
          // 创建sheet
          const worksheet = XLSX.utils.json_to_sheet(notesData)
          XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)
          
          console.log(`成功为博主 ${blogger.bloggerId} 创建本地Excel sheet: ${sheetName}`)
        }
        
        // 生成文件路径 - 使用项目tmp-config目录
        const projectRoot = process.cwd()
        const excelBasePath = path.join(projectRoot, 'tmp-config', 'excel_datas')
        if (!fs.existsSync(excelBasePath)) {
          fs.mkdirSync(excelBasePath, { recursive: true })
        }
        const filePath = `${excelBasePath}/feishu_backup_${Date.now()}.xlsx`
        
        // 写入Excel文件
        XLSX.writeFile(workbook, filePath)
        
        console.log(`✓ 数据已成功备份到本地Excel: ${filePath}`)
        console.log(`=== 本地Excel备份完成 ===`)
        
        // 继续写入飞书数据
        console.log(`=== 开始写入飞书表格数据 ===`)
        console.log(`表格链接: ${tableUrl}`)
        console.log(`共 ${bloggerData.length} 个博主数据需要写入`)
        
        // 获取飞书配置
        const config = this.configManager.getConfig()
        
        // 检查配置是否完整
        if (!config.appId || !config.appSecret) {
          return {
            success: false,
            error: '飞书API配置不完整，请先在设置中配置App ID和App Secret',
            backupFilePath: filePath // 返回备份文件路径
          }
        }
        
        // 解析飞书链接
        const { docId, sheetId, type } = this.parseFeishuDocUrl(tableUrl)
        console.log(`解析结果 - 文档ID: ${docId}, 表格ID: ${sheetId}, 类型: ${type}`)
        
        // 检查是否为飞书多维表格
        if (type !== 'base') {
          return {
            success: false,
            error: '当前仅支持飞书多维表格写入',
            backupFilePath: filePath // 返回备份文件路径
          }
        }
        
        // 获取访问令牌
        const accessToken = await this.getCachedAccessToken(config.appId, config.appSecret)
        
        // 1. 先调用列出表格API，验证权限和获取表格信息
        console.log('=== 验证飞书多维表格权限和表格信息 ===')
        const tablesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables`
        console.log('调用列出表格API地址:', tablesUrl)
        
        const tablesResponse = await fetch(tablesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })
        
        const tablesResponseText = await tablesResponse.text()
        console.log('列出表格API响应:', tablesResponse.status, tablesResponse.statusText, tablesResponseText)
        
        if (!tablesResponse.ok) {
          throw new Error(`验证表格权限失败: ${tablesResponse.status} ${tablesResponse.statusText} - ${tablesResponseText}`)
        }
        
        const tablesData = JSON.parse(tablesResponseText)
        if (!tablesData?.data?.items || tablesData.data.items.length === 0) {
          throw new Error('该多维表格下没有找到任何数据表')
        }
        
        console.log(`✓ 成功获取多维表格列表，共 ${tablesData.data.items.length} 个数据表`)
        console.log('数据表列表:', tablesData.data.items.map((item: any) => ({ table_id: item.table_id, name: item.name })))
        
        // 2. 解析目标表格ID
        const targetTableId = await this.resolveBitableTableId(accessToken, docId, sheetId)
        
        // 3. 验证目标表格是否存在于列表中
        const targetTable = tablesData.data.items.find((item: any) => item.table_id === targetTableId)
        if (!targetTable) {
          throw new Error(`目标表格 ${targetTableId} 不存在于多维表格 ${docId} 中`)
        }
        
        console.log(`✓ 目标表格存在: ${targetTable.name} (${targetTable.table_id})`)
        
        // 4. 准备写入数据
        const records = bloggerData.map(blogger => ({
          fields: {
            '博主ID': blogger.bloggerId,
            '分享链接': blogger.shareUrl,
            '用户名': blogger.user?.nickname || '',
            '头像URL': blogger.user?.avatar || '',
            '小红书号': blogger.user?.uniqueId || '',
            '性别': blogger.user?.gender || '',
            'IP地址': blogger.user?.ipLocation || '',
            '介绍': blogger.user?.desc || '',
            '关注数量': blogger.user?.followingCount || 0,
            '粉丝数量': blogger.user?.followerCount || 0,
            '作品被赞数量': blogger.user?.likedCount || 0,
            '作品收藏数量': blogger.user?.collectedCount || 0,
            '标签': blogger.tags?.join(', ') || blogger.user?.tags?.join(', ') || '',
            '笔记数量': blogger.notes?.length || 0,
            '处理时间': summaryTimestamp
          }
        }))
        
        console.log(`准备写入 ${records.length} 条记录`)
        console.log('写入数据:', records[0])
        
        // 5. 调用列出字段API获取表格实际字段名
        console.log('=== 获取表格字段信息 ===')
        const fieldsUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${targetTableId}/fields`
        console.log('调用列出字段API地址:', fieldsUrl)
        
        const fieldsResponse = await fetch(fieldsUrl, {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })
        
        const fieldsResponseText = await fieldsResponse.text()
        console.log('列出字段API响应:', fieldsResponse.status, fieldsResponseText)
        
        if (!fieldsResponse.ok) {
          throw new Error(`获取表格字段失败: ${fieldsResponse.status} ${fieldsResponseText}`)
        }
        
        const fieldsData = JSON.parse(fieldsResponseText)
        const tableFields = fieldsData?.data?.items || []
        console.log(`获取到 ${tableFields.length} 个表格字段`)
        
        // 6. 检查并初始化表格字段
        console.log('=== 检查并初始化表格字段 ===')
        
        // 从统一的字段映射表中获取需要的字段（博主信息汇总表字段）
        const summaryFields = [
          '博主ID', '分享链接', '用户名', '头像URL', '小红书号', 
          '性别', 'IP地址', '介绍', '关注数量', '粉丝数量', 
          '作品被赞数量', '作品收藏数量', '标签', '笔记数量', '处理时间'
        ]
        
        // 转换为API所需的字段格式
        const requiredFields = summaryFields.map(chineseName => ({
          ui_name: chineseName,
          field_name: fieldNameMapping[chineseName],
          type: 1, // Text类型
          property: null
        }))
        
        const existingFieldNames = new Set(tableFields.map((field: any) => field.field_name))
        
        // 检查需要创建或更新的字段
        const fieldsToCreate: any[] = []
        const fieldsToUpdate: any[] = []
        
        for (const field of requiredFields) {
          if (!existingFieldNames.has(field.field_name)) {
            fieldsToCreate.push(field)
          } else {
            // 检查现有字段的UI名称是否为中文
            const existingField = tableFields.find((f: any) => f.field_name === field.field_name)
            if (existingField && existingField.ui_name !== field.ui_name) {
              // 需要更新UI名称为中文
              fieldsToUpdate.push({
                ...existingField,
                ui_name: field.ui_name
              })
            }
          }
        }
        
        // 创建缺失的字段
        if (fieldsToCreate.length > 0) {
          console.log(`需要创建 ${fieldsToCreate.length} 个字段: ${fieldsToCreate.map(f => f.ui_name).join(', ')}`)
          
          for (const field of fieldsToCreate) {
            const createFieldUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${targetTableId}/fields`
            console.log(`创建字段 "${field.ui_name}" (${field.field_name})`)
            
            const createResponse = await fetch(createFieldUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                field_name: field.field_name,
                ui_name: field.ui_name,
                type: field.type,
                property: field.property
              })
            })
            
            const createResponseText = await createResponse.text()
            console.log(`创建字段API响应: ${createResponse.status} ${createResponseText}`)
            
            if (!createResponse.ok) {
              console.warn(`创建字段 "${field.ui_name}" 失败，将继续执行: ${createResponseText}`)
            } else {
              // 添加到现有字段列表
              const createdField = JSON.parse(createResponseText).data
              tableFields.push(createdField)
              existingFieldNames.add(createdField.field_name)
              console.log(`成功创建字段 "${createdField.ui_name}" -> "${createdField.field_name}"`)
            }
          }
        }
        
        // 更新现有字段的UI名称为中文
        if (fieldsToUpdate.length > 0) {
          console.log(`需要更新 ${fieldsToUpdate.length} 个字段的UI名称为中文`)
          
          for (const field of fieldsToUpdate) {
            const updateFieldUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${targetTableId}/fields/${field.field_id}`
            console.log(`更新字段 "${field.field_name}" 的UI名称为 "${field.ui_name}"`)
            
            const updateResponse = await fetch(updateFieldUrl, {
              method: 'PUT',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                field_name: field.field_name,
                type: field.type,
                ui_name: field.ui_name
              })
            })
            
            const updateResponseText = await updateResponse.text()
            console.log(`更新字段API响应: ${updateResponse.status} ${updateResponseText}`)
            
            try {
              const updateResult = JSON.parse(updateResponseText)
              if (updateResult.code === 0) {
                // 真正的成功
                console.log(`成功更新字段 "${field.field_name}" 的UI名称为 "${field.ui_name}"`)
                // 更新本地字段列表
                const index = tableFields.findIndex((f: any) => f.field_id === field.field_id)
                if (index !== -1) {
                  tableFields[index].ui_name = field.ui_name
                }
              } else if (updateResult.code === 1254606) {
                // 数据没有变化，说明字段已经是正确的状态
                console.log(`字段 "${field.field_name}" 的UI名称已经是 "${field.ui_name}"，无需更新`)
              } else {
                // 其他错误
                console.warn(`更新字段 "${field.field_name}" 的UI名称失败，将继续执行: ${updateResponseText}`)
              }
            } catch (err) {
              console.warn(`解析更新字段响应失败: ${err}`)
              if (!updateResponse.ok) {
                console.warn(`更新字段 "${field.field_name}" 的UI名称失败，将继续执行: ${updateResponseText}`)
              } else {
                console.log(`成功更新字段 "${field.field_name}" 的UI名称为 "${field.ui_name}"`)
              }
            }
          }
        }
        
        if (fieldsToCreate.length === 0 && fieldsToUpdate.length === 0) {
          console.log('所有必填字段已存在且UI名称正确，无需创建或更新')
        }
        
        // 7. 检查现有记录，收集已存在的博主ID和对应的record_id
        console.log('=== 检查并处理旧记录 ===')
        const searchUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${targetTableId}/records/search`
        console.log('调用搜索记录API地址:', searchUrl)
        
        const searchResponse = await fetch(searchUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            page_size: 1000, // 增加分页大小，获取更多记录
            sort: [{
              field_name: 'blogger_id',
              order: 'asc'
            }]
          })
        })
        
        const searchResponseText = await searchResponse.text()
        console.log('搜索记录API响应:', searchResponse.status, searchResponseText)
        
        // 收集已存在的博主ID和对应的record_id
        const existingBloggerMap = new Map<string, string>()
        let existingRecords: any[] = []
        
        if (searchResponse.ok) {
          const searchData = JSON.parse(searchResponseText)
          existingRecords = searchData?.data?.items || []
          
          console.log(`共找到 ${existingRecords.length} 条现有记录`)
        console.log('现有记录详情:', existingRecords)
          
          // 构建博主ID到record_id的映射
          existingRecords.forEach((record: any, index: number) => {
            // 检查record结构
            console.log(`处理第 ${index + 1} 条现有记录:`, record)
            const fields = record.fields || {}
            console.log(`记录字段:`, fields)
            
            // 正确提取博主ID，处理不同格式
            let bloggerId = ''
            const rawBloggerId = fields?.blogger_id || fields?.['博主ID']
            
            if (rawBloggerId) {
              if (Array.isArray(rawBloggerId)) {
                // 处理数组格式，如 [{"text": "496704588", "type": "text"}]
                if (rawBloggerId.length > 0 && rawBloggerId[0]?.text) {
                  bloggerId = rawBloggerId[0].text
                }
              } else if (typeof rawBloggerId === 'string') {
                // 直接字符串格式
                bloggerId = rawBloggerId
              } else if (rawBloggerId.text) {
                // 对象格式 {"text": "496704588"}
                bloggerId = rawBloggerId.text
              }
            }
            
            console.log(`提取的博主ID: "${bloggerId}"`)
            if (bloggerId) {
              existingBloggerMap.set(bloggerId, record.record_id)
              console.log(`现有博主: ${bloggerId} -> ${record.record_id}`)
            }
          })
        console.log(`构建的博主映射: ${JSON.stringify(Array.from(existingBloggerMap.entries()))}`)
          
          // 查找需要删除的记录：
          // 1. 空记录（所有字段都为空）
          // 2. 包含JSON文本的旧记录（通常是单字段且值为JSON字符串）
          const recordsToDelete = existingRecords.filter((record: any) => {
            const fields = record.fields || {}
            const values = Object.values(fields)
            
            // 检查是否为空记录
            const isEmpty = values.every((value: any) => !value || (typeof value === 'string' && value.trim() === ''))
            
            // 检查是否为包含JSON的旧记录
            const hasJsonText = values.some((value: any) => {
              if (typeof value === 'string') {
                // 检查是否包含JSON结构特征
                return value.startsWith('{') && value.endsWith('}') && (value.includes('博主ID') || value.includes('分享链接') || value.includes('笔记数量'))
              }
              return false
            })
            
            return isEmpty || hasJsonText
          })
          
          if (recordsToDelete.length > 0) {
            console.log(`发现 ${recordsToDelete.length} 条需要删除的旧记录（空记录或JSON文本记录）`)
            const recordIdsToDelete = recordsToDelete.map((record: any) => record.record_id)
            
            // 批量删除旧记录
            const deleteUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${targetTableId}/records/batch_delete`
            const deleteResponse = await fetch(deleteUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                records: recordIdsToDelete
              })
            })
            
            const deleteResponseText = await deleteResponse.text()
            console.log(`删除旧记录API响应: ${deleteResponse.status} ${deleteResponseText}`)
            
            if (deleteResponse.ok) {
              console.log(`成功删除 ${recordsToDelete.length} 条旧记录`)
            } else {
              console.warn(`删除旧记录失败: ${deleteResponseText}`)
            }
          } else {
            console.log('没有发现需要删除的旧记录')
          }
        } else {
          console.warn(`获取现有记录失败: ${searchResponseText}`)
        }
        
        // 收集所有可用字段
        console.log('=== 收集可用字段 ===')
        const availableFields: string[] = []
        
        // 收集所有可用字段
        tableFields.forEach((field: any) => {
          const apiFieldName = field.field_name
          availableFields.push(apiFieldName)
          console.log(`可用字段: "${field.ui_name || field.field_name}" -> "${apiFieldName}"`)
        })
        
        // 6. 准备写入数据，使用统一的字段映射表
        console.log('=== 准备写入数据 ===')
        const mappedRecords = records.map((record, index) => {
          const mappedFields: any = {}  
          const blogger = record.fields  
          
          console.log(`处理第 ${index + 1} 条记录，原始数据:`, blogger)
          
          // 使用统一的字段映射表将中文标题转换为API字段名
          for (const [chineseName, value] of Object.entries(blogger)) {
            const apiFieldName = fieldNameMapping[chineseName]
            if (apiFieldName) {
              if (availableFields.includes(apiFieldName)) {
                // 将所有数值类型转换为字符串，因为飞书API可能要求文本字段必须是字符串格式
                let fieldValue = value
                if (typeof fieldValue === 'number') {
                  fieldValue = String(fieldValue)
                } else if (fieldValue === null || fieldValue === undefined) {
                  fieldValue = ''
                }
                
                mappedFields[apiFieldName] = fieldValue
                console.log(`字段映射成功: "${chineseName}" -> "${apiFieldName}" = ${fieldValue} (类型: ${typeof fieldValue})`)
              } else {
                console.warn(`跳过表格中不存在的字段: "${chineseName}" -> "${apiFieldName}"`)
              }
            } else {
              console.warn(`跳过字段: "${chineseName}" 没有对应的API字段映射`)
            }
          }
          
          if (Object.keys(mappedFields).length === 0) {
            console.warn(`警告：第 ${index + 1} 条记录没有有效的字段，将跳过该记录`)
            return null
          }
          
          console.log(`映射后的数据:`, mappedFields)
          return { fields: mappedFields }
        }).filter((record): record is { fields: any } => record !== null) // 过滤掉无效记录
        
        if (mappedRecords.length === 0) {
          throw new Error('没有可写入的有效数据，请检查表格字段配置')
        }
        
        console.log(`映射后共 ${mappedRecords.length} 条记录需要处理`)
        console.log('映射后数据示例:', mappedRecords[0])
        
        // 分离更新记录和插入记录
        console.log('=== 分离更新和插入记录 ===')
        const updateRecords: any[] = []
        const insertRecords: any[] = []
        
        mappedRecords.forEach((record, index) => {
          const bloggerId = record.fields.blogger_id
          if (bloggerId && existingBloggerMap.has(bloggerId)) {
            // 需要更新的记录
            const recordId = existingBloggerMap.get(bloggerId)!
            updateRecords.push({
              record_id: recordId,
              fields: record.fields
            })
            console.log(`记录 ${index + 1} (博主ID: ${bloggerId}) -> 更新 (${recordId})`)
          } else {
            // 需要插入的记录
            insertRecords.push(record)
            console.log(`记录 ${index + 1} (博主ID: ${bloggerId || '新博主'}) -> 插入`)
          }
        })
        
        console.log(`\n需要更新 ${updateRecords.length} 条记录，需要插入 ${insertRecords.length} 条记录`)
        
        // 初始化结果统计
        let totalUpdated = 0
        let totalInserted = 0
        
        // 8. 先处理更新记录
        if (updateRecords.length > 0) {
          console.log('\n=== 开始处理更新记录 ===')
          const updateUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${targetTableId}/records/batch_update`
          console.log('调用批量更新API地址:', updateUrl)
          
          const updateResponse = await fetch(updateUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              records: updateRecords
            })
          })
          
          const updateResponseText = await updateResponse.text()
          console.log('批量更新API响应:', updateResponse.status, updateResponse.statusText, updateResponseText)
          
          if (updateResponse.ok) {
            const updateResult = JSON.parse(updateResponseText)
            // 飞书API返回的是records数组，而非record_ids数组
            const updatedRecords = updateResult.data?.records || []
            totalUpdated = updatedRecords.length || 0
            // 构建record_ids数组，用于后续结果返回
            if (updateResult.data) {
              updateResult.data.record_ids = updatedRecords.map((record: any) => record.record_id)
            }
            console.log(`✓ 成功更新 ${totalUpdated} 条记录`)
          } else {
            console.warn(`更新记录失败，将继续处理插入记录: ${updateResponseText}`)
          }
        }
        
        // 9. 再处理插入记录
        let result: any = { data: { record_ids: [] } }
        if (insertRecords.length > 0) {
          console.log('\n=== 开始处理插入记录 ===')
          const insertUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${targetTableId}/records/batch_create`
          console.log('调用批量插入API地址:', insertUrl)
          
          const insertResponse = await fetch(insertUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              records: insertRecords
            })
          })
          
          const insertResponseText = await insertResponse.text()
          console.log('批量插入API响应:', insertResponse.status, insertResponse.statusText, insertResponseText)
          
          if (!insertResponse.ok) {
            // 解析错误响应，提供更详细的错误信息
            let errorMsg = `插入失败: ${insertResponse.status} ${insertResponse.statusText}`
            try {
              const errorData = JSON.parse(insertResponseText)
              if (errorData?.error?.message) {
                errorMsg += ` - ${errorData.error.message}`
              }
              if (errorData?.code) {
                errorMsg += ` (错误码: ${errorData.code})`
              }
              // 特殊处理403和字段不存在错误
              if (errorData?.code === 91403) {
                errorMsg += '\n建议：请将应用添加为多维表格协作者并授予读写权限'
              } else if (errorData?.code === 1254045) {
                errorMsg += '\n建议：请检查表格字段配置，确保字段名称正确'
              }
            } catch (err) {
              console.warn('解析飞书错误响应失败:', err)
            }
            throw new Error(errorMsg)
          }
          
          result = JSON.parse(insertResponseText)
          // 飞书API返回的是records数组，而非record_ids数组
          const insertedRecords = result.data?.records || []
          totalInserted = insertedRecords.length || 0
          // 构建record_ids数组，用于后续结果返回
          result.data.record_ids = insertedRecords.map((record: any) => record.record_id)
          console.log(`✓ 成功插入 ${totalInserted} 条记录`)
        }
        
        const totalProcessed = totalUpdated + totalInserted
        console.log(`\n✓ 飞书表格数据处理完成，共处理 ${totalProcessed} 条记录（更新 ${totalUpdated} 条，插入 ${totalInserted} 条）`)
        
        console.log(`✓ 飞书表格数据写入成功，共写入 ${result.data?.record_ids?.length || 0} 条记录到博主信息汇总表`)
        
        // 9. 处理博主笔记数据 - 每个博主的笔记数据写入独立的数据表
        console.log('=== 开始处理博主笔记数据 ===')
        
        // 为每个博主创建或使用独立的数据表
        for (const blogger of bloggerData) {
          console.log(`\n=== 处理博主 ${blogger.bloggerId} 的独立数据表 ===`)
          
          // 数据表名称对应xlsx中的sheet名
          const noteTableName = `博主_${blogger.bloggerId}`
          let noteTableId: string | undefined
          
          // 1. 查找是否已存在该博主的数据表
          const existingNoteTable = tablesData.data.items.find((table: any) => 
            table.name === noteTableName
          )
          
          if (existingNoteTable) {
            noteTableId = existingNoteTable.table_id
            console.log(`找到已存在的数据表: ${noteTableName} (${noteTableId})`)
          } else {
            // 2. 创建新的数据表
            console.log(`创建新的数据表: ${noteTableName}`)
            const createNoteTableUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables`
            console.log(`调用创建数据表API地址: ${createNoteTableUrl}`)
            
            // 使用符合飞书API规范的请求体格式，创建独立的数据表
            const createNoteBody = {
              table: {
                name: noteTableName,
                default_view_name: "默认视图",
                fields: [
                  // 笔记数据字段，与xlsx中的sheet字段对应
                  { field_name: "note_id", type: 1 }, // 笔记ID
                  { field_name: "note_url", type: 1 }, // 笔记链接
                  { field_name: "note_type", type: 1 }, // 笔记类型
                  { field_name: "title", type: 1 }, // 标题
                  { field_name: "content", type: 1 }, // 内容
                  { field_name: "cover_image", type: 1 }, // 封面图片
                  { field_name: "video_url", type: 1 }, // 视频地址
                  { field_name: "image_list", type: 1 }, // 图片列表
                  { field_name: "publish_time", type: 1 }, // 发布时间
                  { field_name: "liked_count", type: 1 }, // 点赞数
                  { field_name: "collected_count", type: 1 }, // 收藏数
                  { field_name: "comment_count", type: 1 }, // 评论数
                  { field_name: "share_count", type: 1 }, // 分享数
                  { field_name: "view_count", type: 1 }, // 浏览数
                  { field_name: "tags", type: 1 }, // 标签
                  { field_name: "author_id", type: 1 }, // 作者ID
                  { field_name: "author_name", type: 1 }, // 作者名称
                  { field_name: "author_avatar", type: 1 }, // 作者头像
                  { field_name: "ip_location", type: 1 }, // IP归属地
                  { field_name: "crawl_time", type: 1 } // 爬取时间
                ]
              }
            }
            
            console.log(`创建数据表请求体: ${JSON.stringify(createNoteBody)}`)
            
            const createNoteResponse = await fetch(createNoteTableUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify(createNoteBody)
            })
            
            const createNoteResponseText = await createNoteResponse.text()
            console.log(`创建数据表API响应: ${createNoteResponse.status} ${createNoteResponseText}`)
            
            if (!createNoteResponse.ok) {
              console.error(`创建数据表 ${noteTableName} 失败: ${createNoteResponseText}`)
              throw new Error(`创建数据表失败: ${createNoteResponseText}`)
            }
            
            const createNoteResult = JSON.parse(createNoteResponseText)
            if (createNoteResult.code !== 0 || !createNoteResult.data) {
              console.error(`创建数据表 ${noteTableName} 失败，返回结果异常: ${createNoteResponseText}`)
              throw new Error(`创建数据表失败: ${createNoteResponseText}`)
            }
            
            const createdNoteTable = createNoteResult.data
            if (!createdNoteTable || !createdNoteTable.table_id) {
              console.error(`创建数据表 ${noteTableName} 失败，返回结果中缺少table_id: ${createNoteResponseText}`)
              throw new Error(`创建数据表失败: ${createNoteResponseText}`)
            }
            
            noteTableId = createdNoteTable.table_id
            console.log(`✓ 成功创建数据表: ${noteTableName} (${noteTableId})`)
            
            // 将新创建的数据表添加到列表中，避免重复创建
            tablesData.data.items.push(createdNoteTable)
          }
          
          if (noteTableId) {
            // 3. 获取笔记数据表的字段信息
            const noteFieldsUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTableId}/fields`
            const noteFieldsResponse = await fetch(noteFieldsUrl, {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            })
            
            if (!noteFieldsResponse.ok) {
              console.error(`获取数据表字段失败: ${await noteFieldsResponse.text()}`)
              throw new Error(`获取数据表字段失败: ${await noteFieldsResponse.text()}`)
            }
            
            const noteFieldsData = JSON.parse(await noteFieldsResponse.text())
            const noteTableFields = noteFieldsData?.data?.items || []
            
            // 收集数据表中已存在的字段
            const availableNoteFields = new Map<string, any>()
            noteTableFields.forEach((field: any) => {
              if (field.field_name) {
                availableNoteFields.set(field.field_name, field)
              }
              if (field.ui_name) {
                availableNoteFields.set(field.ui_name, field)
              }
            })
            console.log(`${noteTableName} 数据表可用字段:`, Array.from(availableNoteFields.keys()))
            
            // 4. 准备当前博主的笔记数据
            const notes = blogger.notes || []
            console.log(`博主 ${blogger.bloggerId} 共有 ${notes.length} 条笔记需要处理`)
            
            if (notes.length > 0) {
              // 5. 准备笔记记录，直接使用英文键名，无需映射
              const noteRecords = notes.map(note => {
                const noteFields: any = {}
                
                // 遍历笔记字段，只写入数据表中存在的字段
                Object.entries(note).forEach(([fieldName, value]) => {
                  // 直接使用英文键名，因为blogger.notes中的笔记对象已经是英文键名格式
                  if (availableNoteFields.has(fieldName)) {
                    // 将所有数值类型转换为字符串，因为飞书API可能要求文本字段必须是字符串格式
                    let fieldValue = value
                    if (typeof fieldValue === 'number') {
                      fieldValue = String(fieldValue)
                    } else if (Array.isArray(fieldValue)) {
                      // 将数组转换为字符串，特别是image_list字段，飞书API要求必须是字符串
                      fieldValue = fieldValue.join(', ')
                    } else if (fieldValue === null || fieldValue === undefined) {
                      fieldValue = ''
                    }
                    
                    noteFields[fieldName] = fieldValue
                  }
                })
                
                return { fields: noteFields }
              })
              
              console.log(`准备写入 ${noteRecords.length} 条笔记记录到 ${noteTableName}，示例:`, noteRecords[0])
              
              // 6. 写入笔记数据前，先查询已存在的笔记id，用于去重
              const searchNotesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTableId}/records/search`
              const existingNoteIds = new Set<string>()
              let hasMore = true
              let pageToken = ''
              
              // 处理分页，确保获取到所有的笔记记录
              while (hasMore) {
                const searchNotesResponse = await fetch(searchNotesUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    page_size: 1000,
                    page_token: pageToken,
                    sort: [{ field_name: 'note_id', order: 'asc' }]
                  })
                })
                
                if (!searchNotesResponse.ok) {
                  console.warn(`获取已存在笔记ID失败，将跳过去重: ${await searchNotesResponse.text()}`)
                  break
                }
                
                const searchNotesResult = JSON.parse(await searchNotesResponse.text())
                const existingRecords = searchNotesResult?.data?.items || []
                
                console.log(`获取到第 ${pageToken ? '下' : '一'}页笔记记录，共 ${existingRecords.length} 条`)
                
                existingRecords.forEach((record: any, index: number) => {
                  console.log(`处理第 ${index + 1} 条现有记录:`, record)
                  const fields = record.fields || {}
                  
                  // 提取笔记ID，处理多种可能的格式
                  let noteId = ''
                  const rawNoteId = fields?.note_id || fields?.['笔记ID']
                  
                  console.log(`原始笔记ID:`, rawNoteId)
                  
                  if (rawNoteId) {
                    if (Array.isArray(rawNoteId)) {
                      // 处理数组格式，如 [{ "text": "note123", "type": "text" }]
                      if (rawNoteId.length > 0 && rawNoteId[0]?.text) {
                        noteId = rawNoteId[0].text
                      } else {
                        // 尝试其他数组格式
                        noteId = String(rawNoteId)
                      }
                    } else if (typeof rawNoteId === 'object' && rawNoteId.text) {
                      // 处理对象格式，如 { "text": "note123" }
                      noteId = rawNoteId.text
                    } else {
                      // 直接字符串或数值格式
                      noteId = String(rawNoteId)
                    }
                  }
                  
                  noteId = noteId.trim()
                  console.log(`提取到笔记ID: "${noteId}"`)
                  
                  if (noteId) {
                    existingNoteIds.add(noteId)
                    console.log(`添加到已存在笔记ID集合: ${noteId}`)
                  }
                })
                
                // 检查是否还有更多数据
                hasMore = !!searchNotesResult?.data?.has_more
                pageToken = searchNotesResult?.data?.page_token || ''
                
                // 如果没有更多数据，或者pageToken为空，跳出循环
                if (!hasMore || !pageToken) {
                  break
                }
              }
              
              console.log(`共获取到 ${existingNoteIds.size} 个已存在的笔记ID`)
              console.log(`已存在笔记ID集合:`, Array.from(existingNoteIds))
              
              // 7. 过滤掉已经存在的笔记，只保留新笔记
              const newNoteRecords = noteRecords.filter((record, index) => {
                const fields = record.fields || {}
                let noteId = ''
                
                // 提取笔记ID，处理多种可能的格式
                const rawNoteId = fields?.note_id
                if (rawNoteId) {
                  if (Array.isArray(rawNoteId)) {
                    // 处理数组格式，如 [{ "text": "note123", "type": "text" }]
                    if (rawNoteId.length > 0 && rawNoteId[0]?.text) {
                      noteId = rawNoteId[0].text
                    } else {
                      // 尝试其他数组格式
                      noteId = String(rawNoteId)
                    }
                  } else if (typeof rawNoteId === 'object' && rawNoteId.text) {
                    // 处理对象格式，如 { "text": "note123" }
                    noteId = rawNoteId.text
                  } else {
                    // 直接字符串或数值格式
                    noteId = String(rawNoteId)
                  }
                }
                
                noteId = noteId.trim()
                
                console.log(`检查第 ${index + 1} 条待插入笔记: 笔记ID="${noteId}"`)
                console.log(`笔记ID是否已存在: ${existingNoteIds.has(noteId)}`)
                
                return noteId && !existingNoteIds.has(noteId)
              })
              
              console.log(`过滤后，需要插入 ${newNoteRecords.length} 条新笔记数据到 ${noteTableName}`)
              
              if (newNoteRecords.length > 0) {
                // 8. 写入笔记数据到独立的数据表
                const noteWriteUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTableId}/records/batch_create`
                console.log(`调用写入笔记数据API地址: ${noteWriteUrl}`)
                
                // 分批写入，每批最多500条记录
                const batchSize = 500
                let totalInsertedNotes = 0
                
                for (let i = 0; i < newNoteRecords.length; i += batchSize) {
                  const batchNotes = newNoteRecords.slice(i, i + batchSize)
                  console.log(`写入第 ${Math.floor(i / batchSize) + 1} 批笔记数据到 ${noteTableName}，共 ${batchNotes.length} 条记录`)
                  
                  const batchResponse = await fetch(noteWriteUrl, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                      records: batchNotes
                    })
                  })
                  
                  const batchResponseText = await batchResponse.text()
                  console.log(`写入笔记批次API响应: ${batchResponse.status} ${batchResponseText}`)
                  
                  if (batchResponse.ok) {
                    const batchResult = JSON.parse(batchResponseText)
                    // 飞书API返回的是records数组，而非record_ids数组
                    const insertedNotes = batchResult.data?.records || []
                    const batchInsertedCount = insertedNotes.length || 0
                    totalInsertedNotes += batchInsertedCount
                    console.log(`✓ 成功写入第 ${Math.floor(i / batchSize) + 1} 批笔记数据到 ${noteTableName}，共 ${batchInsertedCount} 条记录`)
                  } else {
                    // 详细解析错误响应，提供更有用的错误信息
                    try {
                      const errorResult = JSON.parse(batchResponseText)
                      if (errorResult.code === 1254060) {
                        // TextFieldConvFail 错误，通常是字段值格式问题
                        console.error(`写入第 ${Math.floor(i / batchSize) + 1} 批笔记数据到 ${noteTableName} 失败: TextFieldConvFail，字段值格式错误`)
                        console.error(`错误详情: ${errorResult.error?.message || errorResult.msg}`)
                        console.error(`请检查笔记数据的格式，特别是image_list字段，必须是字符串格式`)
                      } else {
                        console.error(`写入第 ${Math.floor(i / batchSize) + 1} 批笔记数据到 ${noteTableName} 失败: ${errorResult.msg || batchResponseText}`)
                      }
                    } catch (err) {
                      console.error(`写入第 ${Math.floor(i / batchSize) + 1} 批笔记数据到 ${noteTableName} 失败，解析错误响应失败: ${err}`)
                      console.error(`原始错误响应: ${batchResponseText}`)
                    }
                  }
                }
                
                console.log(`✓ 笔记数据写入完成，共成功写入 ${totalInsertedNotes} 条笔记数据到 ${noteTableName}`)
              } else {
                console.log(`博主 ${blogger.bloggerId} 的所有笔记数据都已存在，无需插入`)
              }
            } else {
              console.log(`博主 ${blogger.bloggerId} 没有笔记数据需要处理`)
            }
          }
        }
        
        console.log(`\n=== 飞书表格数据写入完成 ===`)
        
        return {
          success: true,
          data: result.data,
          message: `成功写入 ${result.data?.record_ids?.length || 0} 条数据到飞书表格，处理了 ${bloggerData.length} 个博主的笔记数据`,
          backupFilePath: filePath // 返回备份文件路径
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

    // 从Excel汇总表中解析博主数据，包括每个博主的详细笔记数据
    ipcMain.handle('feishu:loadExcelSummary', async (_, filePath: string) => {
      try {
        if (!filePath) {
          return {
            success: false,
            error: '请提供Excel文件路径'
          }
        }

        if (!fs.existsSync(filePath)) {
          return {
            success: false,
            error: `未找到文件: ${filePath}`
          }
        }

        const workbook = XLSX.readFile(filePath)
        if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
          return {
            success: false,
            error: 'Excel文件不包含任何工作表'
          }
        }

        const summarySheetName = workbook.SheetNames.find((name) => name === '博主信息汇总')
        let bloggerData: Array<{ 
          bloggerId: string; 
          shareUrl: string; 
          notes: Array<any>;
          user?: {
            nickname?: string;
            avatar?: string;
            uniqueId?: string;
            gender?: string;
            ipLocation?: string;
            desc?: string;
            followingCount?: number;
            followerCount?: number;
            likedCount?: number;
            collectedCount?: number;
          };
          tags?: Array<string>;
        }> = []

        // 解析博主信息汇总表
        if (summarySheetName) {
          const worksheet = workbook.Sheets[summarySheetName]
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' })
          bloggerData = rows
            .map((row) => {
              const bloggerId = String(row['博主ID'] || row['作者ID'] || row['ID'] || '').trim()
              if (!bloggerId) {
                return null
              }

              const shareUrl = String(row['分享链接'] || row['主页链接'] || row['主页'] || '').trim()
              const likedCombined = row['作品被赞数量'] ?? row['作品被赞和收藏数量'] ?? 0
              const collectedCombined = row['作品收藏数量'] ?? row['作品被赞和收藏数量'] ?? 0
              const parsedTags = row['标签'] ? String(row['标签']).split(',').map(t => t.trim()).filter(t => t) : []
              
              // 创建博主对象
              const blogger = {
                bloggerId,
                shareUrl,
                notes: [],
                user: {
                  nickname: row['用户名'] || '',
                  avatar: row['头像URL'] || '',
                  uniqueId: row['小红书号'] || '',
                  gender: row['性别'] || '',
                  ipLocation: row['IP地址'] || '',
                  desc: row['介绍'] || '',
                  followingCount: Number(row['关注数量'] || 0),
                  followerCount: Number(row['粉丝数量'] || 0),
                  likedCount: Number(likedCombined || 0),
                  collectedCount: Number(collectedCombined || 0),
                  tags: parsedTags
                },
                tags: parsedTags
              }
              
              return blogger
            })
            .filter((item): item is any => !!item)
        } 
        
        // 解析每个博主的笔记sheet
        console.log('=== 解析博主笔记sheet ===')
        for (const sheetName of workbook.SheetNames) {
          // 跳过博主信息汇总sheet
          if (sheetName === '博主信息汇总') {
            continue
          }
          
          // 匹配博主ID的sheet名称格式: 博主_123456
          const match = sheetName.match(/博主_(\w+)/)
          if (!match) {
            console.log(`跳过非博主笔记sheet: ${sheetName}`)
            continue
          }
          
          const bloggerId = match[1]
          console.log(`解析博主 ${bloggerId} 的笔记sheet: ${sheetName}`)
          
          // 获取博主对象
          let blogger = bloggerData.find(b => b.bloggerId === bloggerId)
          if (!blogger) {
            // 如果博主信息汇总中没有这个博主，创建新的博主对象
            blogger = {
              bloggerId,
              shareUrl: '',
              notes: [],
              user: {},
              tags: []
            }
            bloggerData.push(blogger)
          }
          
          // 读取笔记数据
          const worksheet = workbook.Sheets[sheetName]
          const rows = XLSX.utils.sheet_to_json<Record<string, any>>(worksheet, { defval: '' })
          
          // 过滤掉标题行或空行
          const validNotes = rows.filter(row => row && typeof row === 'object' && Object.keys(row).length > 0)
          
          // 格式化笔记数据
          const formattedNotes = validNotes.map(note => {
            // 提取图片列表
            const imageList = []
            if (note['图片列表']) {
              imageList.push(...String(note['图片列表']).split(',').map(url => url.trim()))
            }
            
            return {
              note_id: note['笔记ID'] || '',
              note_url: note['笔记链接'] || '',
              note_type: note['笔记类型'] || '',
              title: note['标题'] || '',
              content: note['内容'] || '',
              cover_image: note['封面图片'] || '',
              video_url: note['视频地址'] || '',
              image_list: imageList,
              publish_time: note['发布时间'] || '',
              liked_count: Number(note['点赞数'] || 0),
              collected_count: Number(note['收藏数'] || 0),
              comment_count: Number(note['评论数'] || 0),
              share_count: Number(note['分享数'] || 0),
              view_count: Number(note['浏览数'] || 0),
              tags: note['标签'] ? String(note['标签']).split(',').map(t => t.trim()) : [],
              author_id: note['作者ID'] || bloggerId || '',
              author_name: note['作者名称'] || '',
              author_avatar: note['作者头像'] || '',
              ip_location: note['IP归属地'] || '',
              crawl_time: note['爬取时间'] || ''
            }
          })
          
          // 设置笔记数量
          blogger.notes = formattedNotes
          console.log(`成功解析博主 ${bloggerId} 的 ${formattedNotes.length} 条笔记`)
        }

        if (bloggerData.length === 0) {
          return {
            success: false,
            error: '未能从Excel中解析到任何博主信息'
          }
        }

        console.log(`从Excel共解析出 ${bloggerData.length} 个博主的数据`)
        return {
          success: true,
          data: bloggerData
        }
      } catch (error) {
        console.error('=== 从Excel解析博主数据失败 ===')
        console.error('错误详情:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '解析Excel数据失败'
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
   * 获取Bitable表格ID（当链接未指定时）
   */
  private async resolveBitableTableId(accessToken: string, appToken: string, tableId?: string): Promise<string> {
    if (tableId) {
      return tableId
    }

    console.log('未指定工作表ID，尝试使用Bitable API获取表格列表...')
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
      const resolvedId = tablesData.data.items[0].table_id
      console.log('获取到默认工作表ID:', resolvedId)
      return resolvedId
    }

    throw new Error('未找到任何工作表，请确保多维表格中存在至少一个工作表')
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
      
      const tableId = await this.resolveBitableTableId(accessToken, appToken, sheetId)
      
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
        
        // 辅助函数：提取字段值，支持嵌套对象格式和数组格式
        const extractFieldValue = (field: any): string => {
          if (!field) return ''
          
          // 如果是数组，处理飞书API返回的数组格式，如 [{ "text": "496704588", "type": "text" }]
          if (Array.isArray(field)) {
            // 处理飞书返回的文本数组格式
            if (field.length > 0 && field[0]?.text) {
              return field[0].text
            }
            // 处理普通数组，尝试提取第一个非空值
            const firstNonEmpty = field.find((item: any) => item && item !== '')
            if (firstNonEmpty) {
              return String(firstNonEmpty)
            }
            return ''
          }
          
          // 如果是对象，处理不同类型
          if (typeof field === 'object') {
            // 处理URL类型的字段，格式：{ link: string, text: string, type: 'url' }
            if (field.type === 'url' && (field.link || field.text)) {
              return field.link || field.text
            }
            // 处理文本类型的字段，格式：{ text: string, type: 'text' }
            if (field.text) {
              return field.text
            }
            // 其他对象类型，尝试提取所有可能的文本值
            const textValues = Object.values(field)
              .map((val: any) => {
                if (val && typeof val === 'object' && val.text) return val.text
                if (typeof val === 'string') return val
                return ''
              })
              .filter((val: string) => val)
            
            if (textValues.length > 0) {
              return textValues.join(', ')
            }
            
            // 作为最后的尝试，转换为字符串
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
        else if (fields['博主id']) bloggerId = extractFieldValue(fields['博主id'])
        else if (fields['博主id（必填）']) bloggerId = extractFieldValue(fields['博主id（必填）'])
        else if (fields['bloggerId']) bloggerId = extractFieldValue(fields['bloggerId'])
        else if (fields['id']) bloggerId = extractFieldValue(fields['id'])
        
        if (fields['分享链接']) shareUrl = extractFieldValue(fields['分享链接'])
        else if (fields['主页链接']) shareUrl = extractFieldValue(fields['主页链接'])
        else if (fields['主页链接（必填）']) shareUrl = extractFieldValue(fields['主页链接（必填）'])
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
