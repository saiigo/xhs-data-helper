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
  '爬取时间': 'crawl_time',
  '爬取状态': 'crawl_status'
}

// 获取中文字段名
const getChineseFieldName = (englishName: string): string => {
  return Object.keys(fieldNameMapping).find(key => fieldNameMapping[key] === englishName) || englishName
}

// 获取英文字段名
const getEnglishFieldName = (chineseName: string): string => {
  return fieldNameMapping[chineseName] || chineseName
}

const fetchWithTimeout = async (url: string, options: RequestInit = {}, timeoutMs = 15000) => {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    })
  } finally {
    clearTimeout(timeoutId)
  }
}

const formatNoteForExcel = (note: any) => {
  const imageList = toStringArray(note?.image_list || note?.images || note?.imageList)
  const tags = toStringArray(note?.tags)
  const firstImage = imageList.length > 0 ? imageList[0] : (note?.cover_image || note?.coverImage || note?.cover || '')

  return {
    '笔记ID': note?.note_id || note?.node_id || note?.id || '',
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
    '爬取时间': note?.crawl_time || note?.crawlTime || '',
    '爬取状态': note?.crawl_status || note?.crawlStatus || ''
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
    ipcMain.handle('feishu:fetchBloggerNotes', async (_, bloggerId: string, shareUrl?: string, tableUrl?: string) => {
      try {
        console.log(`=== 开始读取博主 ${bloggerId} 的笔记列表 ===`)
        console.log(`分享链接: ${shareUrl}`)
        console.log(`tableUrl: ${tableUrl}`)
        
        let previousNoteCount = 0
        let existingNoteIds: string[] = []
        let retryNoteUrls: string[] = []
        
        // 1. 从飞书表格获取该博主之前的笔记数量
        if (tableUrl) {
          const config = this.configManager.getConfig()
          if (config.appId && config.appSecret) {
            const accessToken = await this.getCachedAccessToken(config.appId, config.appSecret)
            const { docId } = this.parseFeishuDocUrl(tableUrl)
            
            // 查找博主信息汇总表
            const tablesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables`
            const tablesResponse = await fetch(tablesUrl, {
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            })
            
            if (tablesResponse.ok) {
              const tablesData = JSON.parse(await tablesResponse.text())
              const tables = tablesData?.data?.items || []
              
              // 查找博主信息汇总表
              const summaryTable = tables.find((table: any) => {
                const tableName = (table.name || '').toLowerCase()
                return tableName.includes('汇总') || 
                       tableName.includes('博主') || 
                       tableName.includes('blogger') ||
                       tableName.includes('summary')
              })
              
              if (summaryTable) {
                // 在汇总表中查找该博主的记录
                const searchSummaryUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${summaryTable.table_id}/records/search`
                const summarySearchResponse = await fetch(searchSummaryUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    filter: {
                      conditions: [{
                        field_name: 'blogger_id',
                        operator: 'eq',
                        value: bloggerId
                      }]
                    }
                  })
                })
                
                if (summarySearchResponse.ok) {
                  const summarySearchData = JSON.parse(await summarySearchResponse.text())
                  const bloggerSummary = summarySearchData?.data?.items?.[0]
                  
                  if (bloggerSummary) {
                    // 获取汇总表中的笔记数量
                    previousNoteCount = Number(bloggerSummary.fields?.note_count || bloggerSummary.fields?.['笔记数量'] || 0)
                    console.log(`汇总表中博主 ${bloggerId} 的笔记数量: ${previousNoteCount}`)
                  }
                }
              }

              const extractNoteId = (fields: any): string => {
                const rawNoteId = fields?.note_id || fields?.node_id || fields?.['note_id'] || fields?.['node_id'] || fields?.['笔记ID']
                if (!rawNoteId) return ''
                if (Array.isArray(rawNoteId)) {
                  if (rawNoteId.length > 0 && rawNoteId[0]?.text) {
                    return String(rawNoteId[0].text).trim()
                  }
                  return String(rawNoteId).trim()
                }
                if (typeof rawNoteId === 'object' && rawNoteId.text) {
                  return String(rawNoteId.text).trim()
                }
                return String(rawNoteId).trim()
              }

              const extractNoteUrl = (fields: any): string => {
                const rawNoteUrl = fields?.note_url || fields?.['note_url'] || fields?.['笔记链接'] || fields?.['noteUrl']
                if (!rawNoteUrl) return ''
                if (Array.isArray(rawNoteUrl)) {
                  if (rawNoteUrl.length > 0 && rawNoteUrl[0]?.text) {
                    return String(rawNoteUrl[0].text).trim()
                  }
                  return String(rawNoteUrl).trim()
                }
                if (typeof rawNoteUrl === 'object') {
                  if (rawNoteUrl.link) return String(rawNoteUrl.link).trim()
                  if (rawNoteUrl.text) return String(rawNoteUrl.text).trim()
                }
                return String(rawNoteUrl).trim()
              }

              const isSuccessStatus = (status?: string): boolean => {
                if (!status) return false
                const normalized = status.trim()
                return normalized === '✅' || normalized.toLowerCase() === '成功'
              }

              const noteTableName = `博主_${bloggerId}`
              const noteTable = tables.find((table: any) => table.name === noteTableName)
              if (noteTable) {
                const existingNoteIdsSet = new Set<string>()
                const retryNoteUrlSet = new Set<string>()
                let hasMore = true
                let pageToken = ''
                let pageIndex = 1
                const maxPages = 50
                let sameTokenCount = 0
                const maxSameTokenCount = 3

                while (hasMore && pageIndex <= maxPages) {
                  const listUrl = new URL(`https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTable.table_id}/records`)
                  listUrl.searchParams.set('page_size', '1000')
                  if (pageToken) {
                    listUrl.searchParams.set('page_token', pageToken)
                  }

                  const listResponse = await fetchWithTimeout(listUrl.toString(), {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Content-Type': 'application/json'
                    }
                  })

                  if (!listResponse.ok) {
                    console.warn(`获取已存在笔记失败，将跳过去重: ${await listResponse.text()}`)
                    break
                  }

                  const listResult = JSON.parse(await listResponse.text())
                  if (listResult?.code !== 0 || !listResult?.data) {
                    console.warn(`获取已存在笔记失败，将跳过去重: ${listResult?.msg || '未知错误'}`)
                    break
                  }

                  const existingRecords = listResult?.data?.items || []
                  existingRecords.forEach((record: any) => {
                    const fields = record.fields || {}
                    const noteId = extractNoteId(fields)
                    if (noteId) {
                      existingNoteIdsSet.add(noteId)
                    }

                    const crawlStatus = String(fields?.crawl_status || fields?.['爬取状态'] || '').trim()
                    if (!isSuccessStatus(crawlStatus)) {
                      const noteUrl = extractNoteUrl(fields)
                      if (noteUrl) {
                        retryNoteUrlSet.add(noteUrl)
                      }
                    }
                  })

                  hasMore = !!listResult?.data?.has_more
                  const nextPageToken = listResult?.data?.page_token || ''

                  if (!hasMore) {
                    break
                  }

                  if (pageToken === nextPageToken) {
                    sameTokenCount += 1
                    if (sameTokenCount >= maxSameTokenCount) {
                      console.warn('pageToken连续未变化，停止翻页')
                      break
                    }
                  } else {
                    sameTokenCount = 0
                  }

                  pageToken = nextPageToken
                  pageIndex += 1
                }

                if (pageIndex > maxPages) {
                  console.warn(`分页次数超过 ${maxPages} 页，停止获取`)
                }

                existingNoteIds = Array.from(existingNoteIdsSet)
                const retryNoteUrlsFromTable = Array.from(retryNoteUrlSet)
                console.log(`已存在笔记ID数量: ${existingNoteIds.length}`)
                console.log(`需要补爬的笔记数量: ${retryNoteUrlsFromTable.length}`)
                
                retryNoteUrls = retryNoteUrlsFromTable
                if (retryNoteUrls.length > 0) {
                  console.log(`博主 ${bloggerId} 将优先补爬 ${retryNoteUrls.length} 条笔记详情`)
                }
              } else {
                console.log(`未找到博主 ${bloggerId} 的笔记表，跳过去重读取`)
              }
            }
          }
        }
        
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
            userUrl: userUrl,
            existingNoteIds,
            retryNoteUrls
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
        const notesResult = await new Promise<{ success: boolean; data?: any[]; user?: any; error?: string; noteCount?: number; partial?: boolean }>((resolve) => {
          let allNotes: any[] = []
          let apiSuccess = true
          let apiMsg = ''
          let userInfo: any = null
          let noteCount = 0
          
          // 启动爬虫任务
          pythonBridge.start(spiderConfig, (message) => {
            // 处理不同类型的消息
            switch (message.type) {
              case 'done':
                // 任务完成
                // 注意：这里的message.count表示最新笔记数量（总数）
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
                
                const currentNoteCount = message.count || 0
                noteCount = currentNoteCount
                if (apiSuccess && previousNoteCount > 0) {
                  console.log(`比较笔记数量: 之前 ${previousNoteCount} 条，当前 ${currentNoteCount} 条`)
                }
                
                const partialSuccess = !apiSuccess && allNotes.length > 0
                if (apiSuccess || partialSuccess) {
                  // 如果API调用成功，或有部分数据则返回结果
                  if (partialSuccess) {
                    console.warn(`笔记详情部分失败，已返回已获取数据: ${apiMsg}`)
                  }
                  resolve({
                    success: true,
                    data: allNotes,
                    user: userInfo,
                    noteCount,
                    error: partialSuccess ? apiMsg || '笔记详情获取部分失败' : undefined,
                    partial: partialSuccess
                  })
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
                // 只输出到日志文件，不输出到控制台
                break
              
              case 'progress':
                // 进度消息，更新进度
                // 只输出到日志文件，不输出到控制台
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
          
          const latestCount = notesResult.noteCount ?? 0
          const updateCount = Math.max(latestCount - previousNoteCount, 0)
          return {
            success: true,
            data: notesResult.data || [],
            user: notesResult.user,
            noteCount: notesResult.noteCount,
            previousNoteCount,
            updateCount,
            message: notesResult.message
          }
        } else {
          console.error(`=== 读取博主 ${bloggerId} 的笔记列表失败 ===`)
          console.error('错误详情:', notesResult.error)
          return {
            success: false,
            previousNoteCount,
            updateCount: 0,
            error: notesResult.error || '读取博主笔记列表失败'
          }
        }
      } catch (error) {
        console.error(`=== 读取博主 ${bloggerId} 的笔记列表失败 ===`)
        console.error('错误详情:', error)
        return {
          success: false,
          previousNoteCount: 0,
          updateCount: 0,
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
      noteCount?: number
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
          '笔记数量': (blogger.noteCount ?? blogger.notes?.length) || 0,
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
          const noteCount = (blogger.noteCount ?? blogger.notes?.length) || 0
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
      noteCount?: number
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
            error: '飞书API配置不完整，请先在设置中配置App ID和App Secret'
          }
        }
        
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
        
        // 1. 先调用列出表格API，验证权限和获取表格信息
        console.log('=== 验证飞书多维表格权限和表格信息 ===')
        const tablesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables`
        console.log('调用列出表格API地址:', tablesUrl)
        
        let tablesResponse: Response
        try {
          tablesResponse = await fetchWithTimeout(tablesUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          })
        } catch (error) {
          const errorMsg = error instanceof Error ? error.message : '请求超时'
          throw new Error(`验证表格权限请求失败: ${errorMsg}`)
        }
        
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
        
        // 4. 先检查并初始化汇总表字段，稍后写入汇总数据
        
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
        
        const allExistingRecords: any[] = []
        let hasMore = true
        let pageToken = ''
        let pageIndex = 1
        const maxPages = 50
        let sameTokenCount = 0
        const maxSameTokenCount = 3
        
        while (hasMore && pageIndex <= maxPages) {
          const searchResponse = await fetchWithTimeout(searchUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              page_size: 1000,
              page_token: pageToken,
              field_names: ['*', '_created_time', '_modified_time'],
              sort: [{
                field_name: 'blogger_id',
                order: 'asc'
              }]
            })
          })
          
          const searchResponseText = await searchResponse.text()
          console.log(`搜索记录API响应(第 ${pageIndex} 页):`, searchResponse.status, searchResponseText)
          
          if (!searchResponse.ok) {
            console.warn(`获取现有记录失败: ${searchResponseText}`)
            break
          }
          
          const searchData = JSON.parse(searchResponseText)
          const existingRecords = searchData?.data?.items || []
          allExistingRecords.push(...existingRecords)
          
          console.log(`第 ${pageIndex} 页获取 ${existingRecords.length} 条记录，累计 ${allExistingRecords.length} 条`)
          
          hasMore = !!searchData?.data?.has_more
          const nextPageToken = searchData?.data?.page_token || ''
          
          if (!hasMore) {
            break
          }
          
          if (pageToken === nextPageToken) {
            sameTokenCount += 1
            if (sameTokenCount >= maxSameTokenCount) {
              console.warn('pageToken连续未变化，停止翻页')
              break
            }
          } else {
            sameTokenCount = 0
          }
          
          pageToken = nextPageToken
          pageIndex += 1
        }
        
        if (pageIndex > maxPages) {
          console.warn(`分页次数超过 ${maxPages} 页，停止获取`) 
        }
        
        // 收集已存在的博主ID和对应的record_id
        let existingBloggerMap = new Map<string, string>()
        let existingBloggerFields = new Map<string, any>()
        const recordIdsToDelete = new Set<string>()
        const validRecords: any[] = []
        
        const extractBloggerId = (fields: any): string => {
          const rawBloggerId = fields?.blogger_id || fields?.['博主ID']
          if (!rawBloggerId) return ''
          if (Array.isArray(rawBloggerId)) {
            if (rawBloggerId.length > 0 && rawBloggerId[0]?.text) {
              return String(rawBloggerId[0].text).trim()
            }
            return String(rawBloggerId).trim()
          }
          if (typeof rawBloggerId === 'object' && rawBloggerId.text) {
            return String(rawBloggerId.text).trim()
          }
          return String(rawBloggerId).trim()
        }
        
        if (allExistingRecords.length > 0) {
          console.log(`共找到 ${allExistingRecords.length} 条现有记录`)
          console.log('现有记录详情:', allExistingRecords)
          
          // 查找需要删除的记录：
          // 1. 空记录（所有字段都为空）
          // 2. 包含JSON文本的旧记录（通常是单字段且值为JSON字符串）
          allExistingRecords.forEach((record: any) => {
            const fields = record.fields || {}
            const values = Object.values(fields)
            
            const isEmpty = values.every((value: any) => !value || (typeof value === 'string' && value.trim() === ''))
            const hasJsonText = values.some((value: any) => {
              if (typeof value === 'string') {
                return value.startsWith('{') && value.endsWith('}') && (value.includes('博主ID') || value.includes('分享链接') || value.includes('笔记数量'))
              }
              return false
            })
            
            if (isEmpty || hasJsonText) {
              recordIdsToDelete.add(record.record_id)
            } else {
              validRecords.push(record)
            }
          })
          
          // 根据博主ID去重，保留最新一条记录
          const bloggerIdToRecords = new Map<string, any[]>()
          validRecords.forEach((record: any) => {
            const bloggerId = extractBloggerId(record.fields || {})
            if (!bloggerId) return
            if (!bloggerIdToRecords.has(bloggerId)) {
              bloggerIdToRecords.set(bloggerId, [])
            }
            bloggerIdToRecords.get(bloggerId)!.push(record)
          })
          
          bloggerIdToRecords.forEach((records, bloggerId) => {
            if (records.length === 1) {
              existingBloggerMap.set(bloggerId, records[0].record_id)
              existingBloggerFields.set(bloggerId, records[0].fields || {})
              return
            }
            
            records.sort((a, b) => {
              const timeA = new Date(a._modified_time || a._created_time || 0).getTime()
              const timeB = new Date(b._modified_time || b._created_time || 0).getTime()
              return timeB - timeA
            })
            
            const recordToKeep = records[0]
            existingBloggerMap.set(bloggerId, recordToKeep.record_id)
            existingBloggerFields.set(bloggerId, recordToKeep.fields || {})
            records.slice(1).forEach(record => recordIdsToDelete.add(record.record_id))
          })
          
          console.log(`构建的博主映射: ${JSON.stringify(Array.from(existingBloggerMap.entries()))}`)
          
          if (recordIdsToDelete.size > 0) {
            console.log(`发现 ${recordIdsToDelete.size} 条需要删除的旧记录（空记录、JSON文本或重复记录）`)
            const deleteUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${targetTableId}/records/batch_delete`
            const deleteResponse = await fetch(deleteUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                records: Array.from(recordIdsToDelete)
              })
            })
            
            const deleteResponseText = await deleteResponse.text()
            console.log(`删除旧记录API响应: ${deleteResponse.status} ${deleteResponseText}`)
            
            if (deleteResponse.ok) {
              console.log(`成功删除 ${recordIdsToDelete.size} 条旧记录`)
            } else {
              console.warn(`删除旧记录失败: ${deleteResponseText}`)
            }
          } else {
            console.log('没有发现需要删除的旧记录')
          }
        } else {
          console.log('未找到任何现有记录')
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
        
        let summaryResult: any = { data: { record_ids: [] } }
        let totalUpdated = 0
        let totalInserted = 0
        
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
                  { field_name: "crawl_time", type: 1 }, // 爬取时间
                  { field_name: "crawl_status", type: 1 } // 爬取状态
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

            if (!availableNoteFields.has('crawl_status') && !availableNoteFields.has('爬取状态')) {
              console.log(`${noteTableName} 缺少爬取状态字段，准备创建`)
              const createFieldUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTableId}/fields`
              const createResponse = await fetch(createFieldUrl, {
                method: 'POST',
                headers: {
                  'Authorization': `Bearer ${accessToken}`,
                  'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                  field_name: 'crawl_status',
                  ui_name: '爬取状态',
                  type: 1,
                  property: null
                })
              })

              const createResponseText = await createResponse.text()
              console.log(`创建爬取状态字段API响应: ${createResponse.status} ${createResponseText}`)

              if (createResponse.ok) {
                const createdField = JSON.parse(createResponseText).data
                if (createdField) {
                  if (createdField.field_name) {
                    availableNoteFields.set(createdField.field_name, createdField)
                  }
                  if (createdField.ui_name) {
                    availableNoteFields.set(createdField.ui_name, createdField)
                  }
                }
              } else {
                console.warn(`创建爬取状态字段失败: ${createResponseText}`)
              }
            }
            
            // 4. 准备当前博主的笔记数据，并根据note_id去重
            let notes = blogger.notes || []
            console.log(`博主 ${blogger.bloggerId} 共有 ${notes.length} 条笔记需要处理`)
            
            // 去重逻辑：根据note_id去重，保留有content的，有多个都有content只保留一个
            const uniqueNotesMap = new Map<string, any>()
            
            notes.forEach(note => {
              const noteId = note?.note_id || note?.node_id || note?.id || ''
              if (!noteId) return
              
              // 获取当前note的content
              const noteContent = note?.desc || note?.content || ''
              const hasContent = noteContent && noteContent.trim() !== ''
              
              // 检查是否已存在该note_id的笔记
              if (uniqueNotesMap.has(noteId)) {
                // 已存在，检查现有笔记是否有content
                const existingNote = uniqueNotesMap.get(noteId)
                const existingHasContent = (existingNote?.desc || existingNote?.content || '').trim() !== ''
                
                // 如果现有笔记没有content，而当前笔记有content，则更新
                if (!existingHasContent && hasContent) {
                  uniqueNotesMap.set(noteId, note)
                }
              } else {
                // 不存在，直接添加
                uniqueNotesMap.set(noteId, note)
              }
            })
            
            // 转换为数组
            notes = Array.from(uniqueNotesMap.values())
            console.log(`博主 ${blogger.bloggerId} 去重后剩余 ${notes.length} 条笔记`)
            
            if (notes.length > 0) {
              // 5. 准备笔记记录，先格式化笔记数据，确保键名与飞书数据表字段匹配
              const formattedNotes = notes.map(note => {
                // 使用与生成Excel相同的格式化逻辑，确保键名统一
                const imageList = toStringArray(note?.image_list || note?.images || note?.imageList)
                const tags = toStringArray(note?.tags)
                const firstImage = imageList.length > 0 ? imageList[0] : (note?.cover_image || note?.coverImage || note?.cover || '')
                
                // 统一键名格式，与飞书数据表字段名匹配
                return {
                  note_id: note?.note_id || note?.node_id || note?.id || '',
                  note_url: note?.note_url || note?.url || '',
                  note_type: note?.note_type || note?.type || '',
                  title: note?.title || '',
                  content: note?.desc || note?.content || '',
                  cover_image: note?.video_cover || note?.cover_image || firstImage || '',
                  video_url: note?.video_addr || note?.video_url || note?.videoUrl || '',
                  image_list: imageList,
                  publish_time: note?.upload_time || note?.publish_time || note?.publishTime || '',
                  liked_count: note?.liked_count ?? note?.likes ?? 0,
                  collected_count: note?.collected_count ?? note?.favorites ?? 0,
                  comment_count: note?.comment_count ?? note?.comments ?? 0,
                  share_count: note?.share_count ?? note?.shares ?? 0,
                  view_count: note?.view_count ?? note?.views ?? 0,
                  tags: tags,
                  author_id: note?.author_id || note?.user_id || note?.author?.id || '',
                  author_name: note?.author_name || note?.nickname || note?.author?.name || '',
                  author_avatar: note?.author_avatar || note?.avatar || note?.author?.avatar || '',
                  ip_location: note?.ip_location || note?.ipLocation || '',
                  crawl_time: note?.crawl_time || note?.crawlTime || '',
                  crawl_status: note?.crawl_status || note?.crawlStatus || ''
                }
              })
              
              // 6. 准备笔记记录，写入数据表中存在的字段
              const noteRecords = formattedNotes.map(note => {
                const noteFields: any = {}
                
                // 遍历笔记字段，只写入数据表中存在的字段
                Object.entries(note).forEach(([fieldName, value]) => {
                  let targetFieldName = fieldName
                  if (fieldName === 'note_id' && !availableNoteFields.has(fieldName) && availableNoteFields.has('node_id')) {
                    targetFieldName = 'node_id'
                  }

                  if (availableNoteFields.has(targetFieldName)) {
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
                    
                    noteFields[targetFieldName] = fieldValue
                  }
                })
                
                return { fields: noteFields }
              })
              
              console.log(`准备写入 ${noteRecords.length} 条笔记记录到 ${noteTableName}，示例:`, noteRecords[0])
              
              // 6. 写入笔记数据前，先查询飞书中是否存在重复记录
              console.log(`=== 检查飞书中的现有记录 ===`)
              
              const listNotesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTableId}/records`
              
              // 首先，获取所有已存在的记录（包含重复的note_id）
              const allExistingRecords: any[] = []
              let hasMore = true
              let pageToken = ''
              let retryCount = 0
              const maxRetries = 3
              
              // 处理分页，确保获取到所有的笔记记录
              while (hasMore && retryCount < maxRetries) {
                try {
                  const listUrl = new URL(listNotesUrl)
                  listUrl.searchParams.set('page_size', '1000')
                  if (pageToken) {
                    listUrl.searchParams.set('page_token', pageToken)
                  }

                  const listResponse = await fetchWithTimeout(listUrl.toString(), {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Content-Type': 'application/json'
                    }
                  })
                  
                  if (!listResponse.ok) {
                    console.warn(`获取所有记录失败，将重试: ${await listResponse.text()}`)
                    retryCount++
                    continue
                  }

                  const listResult = JSON.parse(await listResponse.text())
                  if (listResult?.code !== 0 || !listResult?.data) {
                    console.warn(`获取所有记录失败，将重试: ${listResult?.msg || '未知错误'}`)
                    retryCount++
                    continue
                  }
                  const records = listResult?.data?.items || []
                  allExistingRecords.push(...records)

                  hasMore = !!listResult?.data?.has_more
                  const nextPageToken = listResult?.data?.page_token || ''
                  
                  if (!hasMore || pageToken === nextPageToken) {
                    break
                  }
                  
                  pageToken = nextPageToken
                  retryCount = 0 // 重置重试计数
                } catch (error) {
                  console.warn(`获取记录时发生错误，将重试: ${error}`)
                  retryCount++
                }
              }
              
              console.log(`博主 ${blogger.bloggerId} 表 ${noteTableName} 当前记录总数: ${allExistingRecords.length}`)
              
              // 7. 清理飞书中的重复记录
              console.log(`=== 清理飞书中的重复记录 ===`)
              const noteIdToRecordsMap = new Map<string, any[]>()
              const extractRecordNoteId = (fields: any): string => {
                const rawNoteId = fields?.note_id || fields?.node_id || fields?.['note_id'] || fields?.['node_id'] || fields?.['笔记ID']
                if (!rawNoteId) return ''
                if (Array.isArray(rawNoteId)) {
                  if (rawNoteId.length > 0 && rawNoteId[0]?.text) {
                    return String(rawNoteId[0].text).trim()
                  }
                  return String(rawNoteId).trim()
                }
                if (typeof rawNoteId === 'object' && rawNoteId.text) {
                  return String(rawNoteId.text).trim()
                }
                return String(rawNoteId).trim()
              }
              
              // 按note_id分组所有记录
              allExistingRecords.forEach(record => {
                const fields = record.fields || {}
                const noteId = extractRecordNoteId(fields)
                if (noteId) {
                  if (!noteIdToRecordsMap.has(noteId)) {
                    noteIdToRecordsMap.set(noteId, [])
                  }
                  noteIdToRecordsMap.get(noteId)!.push(record)
                }
              })
              
              // 删除每组中多余的记录，保留最新的一条（根据_modified_time或_created_time）
              const recordsToDelete: string[] = []
              noteIdToRecordsMap.forEach((records, noteId) => {
                if (records.length > 1) {
                  console.log(`发现 ${records.length} 条重复的笔记记录，note_id: ${noteId}`)
                  
                  // 按修改时间降序排序，保留最新的一条
                  records.sort((a, b) => {
                    const timeA = new Date(a._modified_time || a._created_time || 0).getTime()
                    const timeB = new Date(b._modified_time || b._created_time || 0).getTime()
                    return timeB - timeA // 降序排序，最新的在前面
                  })
                  
                  // 保留第一条（最新的），其余的加入删除列表
                  const recordsToKeep = records[0]
                  const recordsToRemove = records.slice(1)
                  recordsToRemove.forEach(record => {
                    recordsToDelete.push(record.record_id)
                  })
                  
                  console.log(`保留最新的记录: ${recordsToKeep.record_id}，删除 ${recordsToRemove.length} 条旧记录`)
                }
              })
              
              // 批量删除重复记录
              if (recordsToDelete.length > 0) {
                console.log(`=== 批量删除 ${recordsToDelete.length} 条重复记录 ===`)
                const deleteUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTableId}/records/batch_delete`
                
                // 分批删除，每批最多100条
                const batchSize = 100
                for (let i = 0; i < recordsToDelete.length; i += batchSize) {
                  const batchIds = recordsToDelete.slice(i, i + batchSize)
                  
                  try {
                  const deleteResponse = await fetch(deleteUrl, {
                    method: 'POST',
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                        'Content-Type': 'application/json'
                      },
                      body: JSON.stringify({
                        record_ids: batchIds
                      })
                    })
                    
                    if (!deleteResponse.ok) {
                      console.warn(`删除重复记录失败: ${await deleteResponse.text()}`)
                    } else {
                      console.log(`✓ 成功删除 ${batchIds.length} 条重复记录`)
                    }
                  } catch (error) {
                    console.warn(`删除重复记录时发生错误: ${error}`)
                  }
                }
              }
              
              // 8. 构建最新的note_id到record_id的映射，包含content信息
              const existingNotesMap = new Map<string, { record_id: string; content: string; crawl_status: string }>()
              
              // 重新获取最新的记录，确保数据准确
              const freshRecords: any[] = []
              hasMore = true
              pageToken = ''
              retryCount = 0
              
              while (hasMore && retryCount < maxRetries) {
                try {
                  const listUrl = new URL(listNotesUrl)
                  listUrl.searchParams.set('page_size', '1000')
                  if (pageToken) {
                    listUrl.searchParams.set('page_token', pageToken)
                  }

                  const listResponse = await fetchWithTimeout(listUrl.toString(), {
                    method: 'GET',
                    headers: {
                      'Authorization': `Bearer ${accessToken}`,
                      'Content-Type': 'application/json'
                    }
                  })
                  
                  if (!listResponse.ok) {
                    console.warn(`获取最新记录失败，将重试: ${await listResponse.text()}`)
                    retryCount++
                    continue
                  }

                  const listResult = JSON.parse(await listResponse.text())
                  if (listResult?.code !== 0 || !listResult?.data) {
                    console.warn(`获取最新记录失败，将重试: ${listResult?.msg || '未知错误'}`)
                    retryCount++
                    continue
                  }
                  const records = listResult?.data?.items || []
                  freshRecords.push(...records)

                  hasMore = !!listResult?.data?.has_more
                  const nextPageToken = listResult?.data?.page_token || ''
                  
                  if (!hasMore || pageToken === nextPageToken) {
                    break
                  }
                  
                  pageToken = nextPageToken
                  retryCount = 0 // 重置重试计数
                } catch (error) {
                  console.warn(`获取最新记录时发生错误，将重试: ${error}`)
                  retryCount++
                }
              }
              
              console.log(`重新获取到 ${freshRecords.length} 条最新的笔记记录`)
              
              // 构建映射
              freshRecords.forEach(record => {
                const fields = record.fields || {}
                let noteId = ''
                
                // 提取笔记ID，处理多种可能的格式
                const rawNoteId = fields?.note_id || fields?.node_id || fields?.['note_id'] || fields?.['node_id']
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
                
                if (noteId) {
                  const content = fields?.content || ''
                  const crawlStatus = fields?.crawl_status || fields?.['爬取状态'] || ''
                  existingNotesMap.set(noteId, {
                    record_id: record.record_id,
                    content: content,
                    crawl_status: String(crawlStatus || '').trim()
                  })
                }
              })
              
              console.log(`已存在的唯一note_id数量: ${existingNotesMap.size}`)
              
              // 9. 分离新笔记和需要更新的笔记
              console.log(`=== 分离新笔记和需要更新的笔记 ===`)
              const newNoteRecords: any[] = []
              const updateNoteRecords: any[] = []
              
              // 先对本地笔记进行去重，确保同一note_id只处理一次
              const localNoteMap = new Map<string, any>()
              noteRecords.forEach(record => {
                const fields = record.fields || {}
                const noteId = fields?.note_id || fields?.node_id || fields?.['note_id'] || fields?.['node_id'] || ''
                if (noteId) {
                  // 如果已有相同note_id，保留有content的
                  if (!localNoteMap.has(noteId)) {
                    localNoteMap.set(noteId, record)
                  } else {
                    const existingLocalNote = localNoteMap.get(noteId)
                    const existingHasContent = existingLocalNote.fields?.content && existingLocalNote.fields.content !== ''
                    const currentHasContent = fields?.content && fields.content !== ''
                    
                    if (!existingHasContent && currentHasContent) {
                      localNoteMap.set(noteId, record)
                    }
                  }
                }
              })
              
              console.log(`本地笔记去重后剩余 ${localNoteMap.size} 条`)
              
              // 遍历去重后的本地笔记，决定更新还是插入
              const isSuccessStatus = (status?: string): boolean => {
                if (!status) return false
                const normalized = status.trim()
                return normalized === '✅' || normalized.toLowerCase() === '成功'
              }

              localNoteMap.forEach(record => {
                const fields = record.fields || {}
                let noteId = ''
                
                // 提取笔记ID，处理多种可能的格式
                const rawNoteId = fields?.note_id || fields?.node_id || fields?.['note_id'] || fields?.['node_id']
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
                
                if (noteId) {
                  if (existingNotesMap.has(noteId)) {
                    // 笔记已存在，检查是否需要更新
                    const existingNote = existingNotesMap.get(noteId)!
                    const existingStatus = existingNote.crawl_status || ''
                    const currentStatus = String(fields?.crawl_status || fields?.['爬取状态'] || '').trim()
                    const needsContentUpdate = (!existingNote.content || existingNote.content === '') && fields?.content && fields.content !== ''
                    const needsStatusUpdate = !isSuccessStatus(existingStatus) && isSuccessStatus(currentStatus)

                    if (needsContentUpdate || needsStatusUpdate) {
                      console.log(`笔记ID=${noteId} 需要更新 (content=${needsContentUpdate}, status=${needsStatusUpdate})`)
                      updateNoteRecords.push({
                        record_id: existingNote.record_id,
                        fields: fields
                      })
                    } else {
                      console.log(`笔记ID=${noteId} 已存在且content不为空，无需更新`)
                    }
                  } else {
                    // 新笔记，需要插入
                    console.log(`笔记ID=${noteId} 新笔记，需要插入`)
                    newNoteRecords.push(record)
                  }
                }
              })
              
              console.log(`过滤后，需要插入 ${newNoteRecords.length} 条新笔记数据到 ${noteTableName}`)
              
              // 10. 处理需要更新的笔记
              if (updateNoteRecords.length > 0) {
                console.log(`需要更新 ${updateNoteRecords.length} 条笔记数据到 ${noteTableName}`)
                const noteUpdateUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTableId}/records/batch_update`
                console.log(`调用更新笔记数据API地址: ${noteUpdateUrl}`)
                
                // 分批更新，每批最多500条记录
                const batchSize = 500
                let totalUpdatedNotes = 0
                
                for (let i = 0; i < updateNoteRecords.length; i += batchSize) {
                  const batchNotes = updateNoteRecords.slice(i, i + batchSize)
                  console.log(`更新第 ${Math.floor(i / batchSize) + 1} 批笔记数据到 ${noteTableName}，共 ${batchNotes.length} 条记录`)
                  
                  const batchResponse = await fetch(noteUpdateUrl, {
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
                  console.log(`更新笔记批次API响应: ${batchResponse.status} ${batchResponseText}`)
                  
                  if (batchResponse.ok) {
                    const batchResult = JSON.parse(batchResponseText)
                    // 飞书API返回的是records数组，而非record_ids数组
                    const updatedNotes = batchResult.data?.records || []
                    const batchUpdatedCount = updatedNotes.length || 0
                    totalUpdatedNotes += batchUpdatedCount
                    console.log(`✓ 成功更新第 ${Math.floor(i / batchSize) + 1} 批笔记数据到 ${noteTableName}，共 ${batchUpdatedCount} 条记录`)
                  } else {
                    // 详细解析错误响应，提供更有用的错误信息
                    try {
                      const errorResult = JSON.parse(batchResponseText)
                      if (errorResult.code === 1254060) {
                        // TextFieldConvFail 错误，通常是字段值格式问题
                        console.error(`更新第 ${Math.floor(i / batchSize) + 1} 批笔记数据到 ${noteTableName} 失败: TextFieldConvFail，字段值格式错误`)
                        console.error(`错误详情: ${errorResult.error?.message || errorResult.msg}`)
                        console.error(`请检查笔记数据的格式，特别是image_list字段，必须是字符串格式`)
                      } else {
                        console.error(`更新第 ${Math.floor(i / batchSize) + 1} 批笔记数据到 ${noteTableName} 失败: ${errorResult.msg || batchResponseText}`)
                      }
                    } catch (err) {
                      console.error(`更新第 ${Math.floor(i / batchSize) + 1} 批笔记数据到 ${noteTableName} 失败，解析错误响应失败: ${err}`)
                      console.error(`原始错误响应: ${batchResponseText}`)
                    }
                  }
                }
                
                console.log(`✓ 笔记数据更新完成，共成功更新 ${totalUpdatedNotes} 条笔记数据到 ${noteTableName}`)
              }
              
              // 11. 处理需要插入的新笔记
              if (newNoteRecords.length > 0) {
                // 写入笔记数据到独立的数据表
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
              } else if (updateNoteRecords.length === 0) {
                console.log(`博主 ${blogger.bloggerId} 的所有笔记数据都已存在且无需更新`)
              }
            } else {
              console.log(`博主 ${blogger.bloggerId} 没有笔记数据需要处理`)
            }
          }
        }

        // 10. 汇总表写入（根据当前笔记表数量更新note_count）
        console.log('=== 开始写入博主信息汇总表 ===')

        const refreshSummaryExistingRecords = async () => {
          const recordsUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${targetTableId}/records`
          const allExistingRecords: any[] = []
          let hasMore = true
          let pageToken = ''
          let pageIndex = 1
          const maxPages = 50
          let sameTokenCount = 0
          const maxSameTokenCount = 3

          while (hasMore && pageIndex <= maxPages) {
            const url = new URL(recordsUrl)
            url.searchParams.set('page_size', '1000')
            if (pageToken) {
              url.searchParams.set('page_token', pageToken)
            }

            const response = await fetchWithTimeout(url.toString(), {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            })

            const responseText = await response.text()
            if (!response.ok) {
              console.warn(`刷新汇总表记录失败: ${responseText}`)
              break
            }

            const responseData = JSON.parse(responseText)
            if (responseData?.code !== 0 || !responseData?.data) {
              console.warn(`刷新汇总表记录失败: ${responseData?.msg || '未知错误'}`)
              break
            }

            const items = responseData?.data?.items || []
            allExistingRecords.push(...items)

            hasMore = !!responseData?.data?.has_more
            const nextPageToken = responseData?.data?.page_token || ''

            if (!hasMore) {
              break
            }

            if (pageToken === nextPageToken) {
              sameTokenCount += 1
              if (sameTokenCount >= maxSameTokenCount) {
                console.warn('汇总表pageToken连续未变化，停止翻页')
                break
              }
            } else {
              sameTokenCount = 0
            }

            pageToken = nextPageToken
            pageIndex += 1
          }

          if (pageIndex > maxPages) {
            console.warn(`汇总表分页超过 ${maxPages} 页，停止获取`)
          }

          const refreshedMap = new Map<string, string>()
          const refreshedFields = new Map<string, any>()

          allExistingRecords.forEach((record) => {
            const fields = record.fields || {}
            let bloggerId = ''
            const rawBloggerId = fields?.blogger_id || fields?.['博主ID']
            if (rawBloggerId) {
              if (Array.isArray(rawBloggerId)) {
                if (rawBloggerId.length > 0 && rawBloggerId[0]?.text) {
                  bloggerId = rawBloggerId[0].text
                } else {
                  bloggerId = String(rawBloggerId)
                }
              } else if (typeof rawBloggerId === 'object' && rawBloggerId.text) {
                bloggerId = rawBloggerId.text
              } else {
                bloggerId = String(rawBloggerId)
              }
            }

            bloggerId = String(bloggerId || '').trim()
            if (bloggerId) {
              refreshedMap.set(bloggerId, record.record_id)
              refreshedFields.set(bloggerId, fields)
            }
          })

          existingBloggerMap = refreshedMap
          existingBloggerFields = refreshedFields
          console.log(`刷新后汇总表记录数: ${existingBloggerMap.size}`)
        }

        await refreshSummaryExistingRecords()

        const fetchNoteTableCount = async (noteTableId: string): Promise<number> => {
          const recordsUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTableId}/records`
          let totalNotes = 0
          let hasMore = true
          let pageToken = ''
          let pageIndex = 1
          const maxPages = 50
          let sameTokenCount = 0
          const maxSameTokenCount = 3

          while (hasMore && pageIndex <= maxPages) {
            const url = new URL(recordsUrl)
            url.searchParams.set('page_size', '1000')
            if (pageToken) {
              url.searchParams.set('page_token', pageToken)
            }

            const response = await fetchWithTimeout(url.toString(), {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            })

            if (!response.ok) {
              throw new Error(`获取笔记数量失败: ${response.status} ${await response.text()}`)
            }

            const responseData = JSON.parse(await response.text())
            if (responseData?.code !== 0 || !responseData?.data) {
              throw new Error(`获取笔记数量失败: ${responseData?.msg || '未知错误'}`)
            }

            const items = responseData?.data?.items || []
            totalNotes += items.length

            hasMore = !!responseData?.data?.has_more
            const nextPageToken = responseData?.data?.page_token || ''

            if (!hasMore) {
              break
            }

            if (pageToken === nextPageToken) {
              sameTokenCount += 1
              if (sameTokenCount >= maxSameTokenCount) {
                console.warn('pageToken连续未变化，停止统计笔记数量')
                break
              }
            } else {
              sameTokenCount = 0
            }

            pageToken = nextPageToken
            pageIndex += 1
          }

          if (pageIndex > maxPages) {
            console.warn(`笔记数量分页超过 ${maxPages} 页，停止统计`)
          }

          return totalNotes
        }

        const summaryRecords = await Promise.all(bloggerData.map(async (blogger) => {
          let actualNoteCount = (blogger.noteCount ?? blogger.notes?.length) || 0

          try {
            const noteTableName = `博主_${blogger.bloggerId}`
            const existingNoteTable = tablesData.data.items.find((table: any) => table.name === noteTableName)
            if (existingNoteTable) {
              const totalNotes = await fetchNoteTableCount(existingNoteTable.table_id)
              if (totalNotes > 0) {
                actualNoteCount = totalNotes
                console.log(`博主 ${blogger.bloggerId} 飞书实际笔记数量: ${totalNotes}`)
              }
            }
          } catch (error) {
            console.warn(`获取博主 ${blogger.bloggerId} 实际笔记数量失败，使用默认值: ${actualNoteCount}`)
          }

          return {
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
              '笔记数量': actualNoteCount,
              '处理时间': summaryTimestamp
            }
          }
        }))

        console.log(`准备写入 ${summaryRecords.length} 条记录`)
        console.log('写入数据:', summaryRecords[0])

        // 11. 准备写入数据，使用统一的字段映射表
        console.log('=== 准备写入数据 ===')
        const mappedRecords = summaryRecords.map((record, index) => {
          const mappedFields: any = {}
          const blogger = record.fields

          console.log(`处理第 ${index + 1} 条记录，原始数据:`, blogger)

          // 使用统一的字段映射表将中文标题转换为API字段名
          for (const [chineseName, value] of Object.entries(blogger)) {
            const apiFieldName = fieldNameMapping[chineseName]
            if (apiFieldName) {
              if (availableFields.includes(apiFieldName)) {
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
        }).filter((record): record is { fields: any } => record !== null)

        if (mappedRecords.length === 0) {
          throw new Error('没有可写入的有效数据，请检查表格字段配置')
        }

        const extractBloggerIdValue = (value: any): string => {
          if (!value) return ''
          if (Array.isArray(value)) {
            if (value.length > 0 && value[0]?.text) {
              return String(value[0].text).trim()
            }
            return String(value).trim()
          }
          if (typeof value === 'object' && value.text) {
            return String(value.text).trim()
          }
          return String(value).trim()
        }

        const isEmptyValue = (value: any): boolean => {
          if (value === null || value === undefined) return true
          if (typeof value === 'string') return value.trim() === ''
          return false
        }

        const parseNumberValue = (value: any): number | null => {
          if (value === null || value === undefined || value === '') return null
          const numericValue = Number(value)
          return Number.isNaN(numericValue) ? null : numericValue
        }

        const mergeSummaryFields = (existingFields: any, incomingFields: any): any => {
          const mergedFields: any = { ...existingFields }
          const allFieldNames = new Set([...Object.keys(existingFields || {}), ...Object.keys(incomingFields || {})])

          allFieldNames.forEach((fieldName) => {
            const incomingValue = incomingFields?.[fieldName]
            const existingValue = existingFields?.[fieldName]

            if (fieldName === 'note_count') {
              if (!isEmptyValue(incomingValue)) {
                mergedFields[fieldName] = incomingValue
              }
              return
            }

            const incomingNumber = parseNumberValue(incomingValue)
            const existingNumber = parseNumberValue(existingValue)

            if (incomingNumber !== null || existingNumber !== null) {
              if (incomingNumber === null) {
                mergedFields[fieldName] = existingValue
              } else if (existingNumber === null) {
                mergedFields[fieldName] = incomingValue
              } else {
                mergedFields[fieldName] = incomingNumber >= existingNumber ? incomingValue : existingValue
              }
              return
            }

            if (!isEmptyValue(incomingValue)) {
              mergedFields[fieldName] = incomingValue
              return
            }

            if (!isEmptyValue(existingValue)) {
              mergedFields[fieldName] = existingValue
            }
          })

          return mergedFields
        }

        const uniqueMappedRecords: { fields: any }[] = []
        const seenBloggerIds = new Map<string, { fields: any }>()

        mappedRecords.forEach(record => {
          const bloggerId = extractBloggerIdValue(record.fields?.blogger_id)
          if (!bloggerId) {
            uniqueMappedRecords.push(record)
            return
          }

          if (!seenBloggerIds.has(bloggerId)) {
            seenBloggerIds.set(bloggerId, record)
          } else {
            const existingRecord = seenBloggerIds.get(bloggerId)!
            const existingNoteCount = Number(existingRecord.fields?.note_count ?? 0)
            const currentNoteCount = Number(record.fields?.note_count ?? 0)
            const existingFieldCount = Object.keys(existingRecord.fields || {}).length
            const currentFieldCount = Object.keys(record.fields || {}).length

            if (currentNoteCount > existingNoteCount || currentFieldCount > existingFieldCount) {
              seenBloggerIds.set(bloggerId, record)
            }
          }
        })

        if (seenBloggerIds.size > 0) {
          uniqueMappedRecords.push(...seenBloggerIds.values())
        }

        console.log(`映射后共 ${uniqueMappedRecords.length} 条记录需要处理`)
        console.log('映射后数据示例:', uniqueMappedRecords[0])

        // 分离更新记录和插入记录
        console.log('=== 分离更新和插入记录 ===')
        const updateRecords: any[] = []
        const insertRecords: any[] = []

        uniqueMappedRecords.forEach((record, index) => {
          const bloggerId = record.fields.blogger_id
          if (bloggerId && existingBloggerMap.has(bloggerId)) {
            const recordId = existingBloggerMap.get(bloggerId)!
            const existingFields = existingBloggerFields.get(bloggerId)
            const mergedFields = existingFields ? mergeSummaryFields(existingFields, record.fields) : record.fields
            updateRecords.push({
              record_id: recordId,
              fields: mergedFields
            })
            console.log(`记录 ${index + 1} (博主ID: ${bloggerId}) -> 更新 (${recordId})`)
          } else {
            insertRecords.push(record)
            console.log(`记录 ${index + 1} (博主ID: ${bloggerId || '新博主'}) -> 插入`)
          }
        })

        console.log(`\n需要更新 ${updateRecords.length} 条记录，需要插入 ${insertRecords.length} 条记录`)

        // 12. 先处理更新记录
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
            const updatedRecords = updateResult.data?.records || []
            totalUpdated = updatedRecords.length || 0
            if (updateResult.data) {
              updateResult.data.record_ids = updatedRecords.map((record: any) => record.record_id)
            }
            summaryResult.data.record_ids = updatedRecords.map((record: any) => record.record_id)
            console.log(`✓ 成功更新 ${totalUpdated} 条记录`)
          } else {
            console.warn(`更新记录失败，将继续处理插入记录: ${updateResponseText}`)
          }
        }

        // 13. 再处理插入记录
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
            let errorMsg = `插入失败: ${insertResponse.status} ${insertResponse.statusText}`
            try {
              const errorData = JSON.parse(insertResponseText)
              if (errorData?.error?.message) {
                errorMsg += ` - ${errorData.error.message}`
              }
              if (errorData?.code) {
                errorMsg += ` (错误码: ${errorData.code})`
              }
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

          summaryResult = JSON.parse(insertResponseText)
          const insertedRecords = summaryResult.data?.records || []
          totalInserted = insertedRecords.length || 0
          summaryResult.data.record_ids = insertedRecords.map((record: any) => record.record_id)
          console.log(`✓ 成功插入 ${totalInserted} 条记录`)
        }

        const totalProcessed = totalUpdated + totalInserted
        console.log(`\n✓ 飞书表格数据处理完成，共处理 ${totalProcessed} 条记录（更新 ${totalUpdated} 条，插入 ${totalInserted} 条）`)
        console.log(`✓ 飞书表格数据写入成功，共写入 ${summaryResult.data?.record_ids?.length || 0} 条记录到博主信息汇总表`)
        
        console.log(`\n=== 飞书表格数据写入完成 ===`)
        
        return {
          success: true,
          data: summaryResult.data,
          message: `成功写入 ${summaryResult.data?.record_ids?.length || 0} 条数据到飞书表格，处理了 ${bloggerData.length} 个博主的笔记数据`
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

    // 清理飞书表格数据 - 对每个博主表格进行去重，保留有content的记录
    ipcMain.handle('feishu:cleanTableData', async (_, tableUrl: string) => {
      try {
        console.log(`=== 开始清理飞书表格数据 ===`)
        console.log(`表格链接: ${tableUrl}`)
        
        // 获取飞书配置
        const config = this.configManager.getConfig()
        
        // 检查配置是否完整
        if (!config.appId || !config.appSecret) {
          return {
            success: false,
            error: '飞书API配置不完整，请先在设置中配置App ID和App Secret'
          }
        }
        
        // 解析飞书链接
        const { docId, type } = this.parseFeishuDocUrl(tableUrl)
        console.log(`解析结果 - 文档ID: ${docId}, 类型: ${type}`)
        
        // 检查是否为飞书多维表格
        if (type !== 'base') {
          return {
            success: false,
            error: '当前仅支持飞书多维表格清理'
          }
        }
        
        // 获取访问令牌
        const accessToken = await this.getCachedAccessToken(config.appId, config.appSecret)
        
        // 1. 先调用列出表格API，获取所有表格信息
        console.log('=== 获取所有表格信息 ===')
        const tablesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables`
        console.log('调用列出表格API地址:', tablesUrl)
        
        const tablesResponse = await fetchWithTimeout(tablesUrl, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })
        
        const tablesResponseText = await tablesResponse.text()
        console.log('列出表格API响应:', tablesResponse.status, tablesResponseText)
        
        if (!tablesResponse.ok) {
          throw new Error(`获取表格列表失败: ${tablesResponse.status} ${tablesResponseText}`)
        }
        
        const tablesData = JSON.parse(tablesResponseText)
        if (!tablesData?.data?.items || tablesData.data.items.length === 0) {
          throw new Error('该多维表格下没有找到任何数据表')
        }
        
        const fetchAllRecords = async (tableId: string): Promise<any[]> => {
          const recordsUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${tableId}/records`
          const allRecords: any[] = []
          let hasMore = true
          let pageToken = ''
          let pageIndex = 1
          const maxPages = 50
          let sameTokenCount = 0
          const maxSameTokenCount = 3

          while (hasMore && pageIndex <= maxPages) {
            const url = new URL(recordsUrl)
            url.searchParams.set('page_size', '1000')
            if (pageToken) {
              url.searchParams.set('page_token', pageToken)
            }

            const response = await fetchWithTimeout(url.toString(), {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            })

            if (!response.ok) {
              throw new Error(`获取记录失败: ${response.status} ${await response.text()}`)
            }

            const responseData = JSON.parse(await response.text())
            if (responseData?.code !== 0 || !responseData?.data) {
              throw new Error(`获取记录失败: ${responseData?.msg || '未知错误'}`)
            }

            const items = responseData?.data?.items || []
            allRecords.push(...items)

            hasMore = !!responseData?.data?.has_more
            const nextPageToken = responseData?.data?.page_token || ''

            if (!hasMore) {
              break
            }

            if (pageToken === nextPageToken) {
              sameTokenCount += 1
              if (sameTokenCount >= maxSameTokenCount) {
                console.warn('pageToken连续未变化，停止翻页')
                break
              }
            } else {
              sameTokenCount = 0
            }

            pageToken = nextPageToken
            pageIndex += 1
          }

          if (pageIndex > maxPages) {
            console.warn(`分页次数超过 ${maxPages} 页，停止获取`)
          }

          return allRecords
        }

        // 2. 确定需要处理的表格：所有博主相关表格（名称以"博主_"开头），以及汇总表
        const bloggerTables = tablesData.data.items.filter((item: any) => 
          item.name.startsWith('博主_')
        )

        const summaryTable = tablesData.data.items[0]
        
        console.log(`需要处理的博主表格数量: ${bloggerTables.length}`)
        console.log(`需要处理的博主表格列表: ${JSON.stringify(bloggerTables.map((item: any) => ({ name: item.name, table_id: item.table_id })))}`)
        
        let totalDeduplicated = 0
        let summaryDeduplicated = 0

        // 2.1 先处理汇总表去重
        if (summaryTable) {
          console.log(`\n=== 开始处理汇总表: ${summaryTable.name} (${summaryTable.table_id}) ===`)

          const summaryRecords = await fetchAllRecords(summaryTable.table_id)
          console.log(`汇总表记录数: ${summaryRecords.length}`)

          if (summaryRecords.length === 0) {
            console.log('汇总表没有记录，无需处理')
          } else {
            const extractBloggerId = (fields: any): string => {
              const rawBloggerId = fields?.blogger_id || fields?.bloggerId || fields?.['博主ID'] || fields?.['博主id']
              if (!rawBloggerId) return ''
              if (Array.isArray(rawBloggerId)) {
                if (rawBloggerId.length > 0 && rawBloggerId[0]?.text) {
                  return String(rawBloggerId[0].text).trim()
                }
                return String(rawBloggerId).trim()
              }
              if (typeof rawBloggerId === 'object' && rawBloggerId.text) {
                return String(rawBloggerId.text).trim()
              }
              return String(rawBloggerId).trim()
            }

            const isFieldEmpty = (value: any): boolean => {
              if (value === null || value === undefined) return true
              if (typeof value === 'string') return value.trim() === ''
              if (Array.isArray(value)) return value.length === 0
              if (typeof value === 'object') {
                if (typeof value.text === 'string') return value.text.trim() === ''
                if (typeof value.link === 'string') return value.link.trim() === ''
                return Object.values(value).every(isFieldEmpty)
              }
              return false
            }

            const countNonEmptyFields = (fields: any): number => {
              if (!fields) return 0
              return Object.values(fields).reduce((count, value) => {
                return count + (isFieldEmpty(value) ? 0 : 1)
              }, 0)
            }

            const getRecordTime = (record: any): number => {
              const timeValue = record._modified_time || record._created_time || record.created_time || 0
              return new Date(timeValue).getTime() || 0
            }

            const recordsByBloggerId = new Map<string, any[]>()
            summaryRecords.forEach(record => {
              const bloggerId = extractBloggerId(record.fields || {})
              if (!bloggerId) return
              if (!recordsByBloggerId.has(bloggerId)) {
                recordsByBloggerId.set(bloggerId, [])
              }
              recordsByBloggerId.get(bloggerId)!.push(record)
            })

            const recordsToDelete: any[] = []
            recordsByBloggerId.forEach((records, bloggerId) => {
              if (records.length <= 1) return

              let bestRecord = records[0]
              let bestScore = countNonEmptyFields(bestRecord.fields || {})
              let bestTime = getRecordTime(bestRecord)

              records.slice(1).forEach(record => {
                const score = countNonEmptyFields(record.fields || {})
                const time = getRecordTime(record)
                if (score > bestScore || (score === bestScore && time > bestTime)) {
                  bestRecord = record
                  bestScore = score
                  bestTime = time
                }
              })

              records.forEach(record => {
                if (record.record_id !== bestRecord.record_id) {
                  recordsToDelete.push(record)
                }
              })
            })

            if (recordsToDelete.length > 0) {
              console.log(`汇总表发现 ${recordsToDelete.length} 条重复记录，准备删除`)
              const batchSize = 500
              for (let i = 0; i < recordsToDelete.length; i += batchSize) {
                const batchRecords = recordsToDelete.slice(i, i + batchSize)
                const recordIds = batchRecords.map(record => record.record_id)
                const deleteUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${summaryTable.table_id}/records/batch_delete`
                const deleteResponse = await fetchWithTimeout(deleteUrl, {
                  method: 'POST',
                  headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                  },
                  body: JSON.stringify({
                    records: recordIds
                  })
                })

                const deleteResponseText = await deleteResponse.text()
                console.log(`汇总表删除记录API响应: ${deleteResponse.status} ${deleteResponseText}`)

                if (!deleteResponse.ok) {
                  throw new Error(`删除汇总表重复记录失败: ${deleteResponse.status} ${deleteResponseText}`)
                }

                const deleteResult = JSON.parse(deleteResponseText)
                const deletedCount = (deleteResult.data?.records || []).filter((r: any) => r.deleted === true).length || 0
                summaryDeduplicated += deletedCount
              }
              console.log(`✓ 汇总表去重完成，共删除 ${summaryDeduplicated} 条重复记录`)
            } else {
              console.log('汇总表没有重复记录，无需删除')
            }
          }
        } else {
          console.log('未找到汇总表，跳过汇总表清理')
        }
        
        // 3. 遍历所有博主表格，依次进行去重处理
        for (const table of bloggerTables) {
          console.log(`\n=== 开始处理表格: ${table.name} (${table.table_id}) ===`)
          
          // 首先获取该表格的所有记录
          const recordsUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${table.table_id}/records`
          const allRecords: any[] = []
          
          let hasMore = true
          let pageToken = ''
          let pageIndex = 1
          const maxPages = 50 // 设置最大页数限制，避免无限循环
          
          // 处理分页，确保获取到所有有效记录
          let sameTokenCount = 0 // 统计连续相同pageToken的次数
          const maxSameTokenCount = 5 // 允许连续相同pageToken的最大次数，增加到5次
          
          while (hasMore && pageIndex <= maxPages) {
            const url = new URL(recordsUrl)
            url.searchParams.set('page_size', '1000')
            if (pageToken) {
              url.searchParams.set('page_token', pageToken)
            }

            const listResponse = await fetchWithTimeout(url.toString(), {
              method: 'GET',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              }
            })
            
            if (!listResponse.ok) {
              throw new Error(`获取记录失败: ${listResponse.status} ${await listResponse.text()}`)
            }
            
            const listResult = JSON.parse(await listResponse.text())
            if (listResult?.code !== 0 || !listResult?.data) {
              throw new Error(`获取记录失败: ${listResult?.msg || '未知错误'}`)
            }
            const existingRecords = listResult?.data?.items || []
            
            console.log(`第 ${pageIndex} 页API响应: has_more=${listResult?.data?.has_more}, page_token=${listResult?.data?.page_token}`)
            
            // 检查当前页是否有记录
            if (existingRecords.length === 0) {
              console.log(`第 ${pageIndex} 页获取到 0 条记录，停止翻页`)
              break
            }
            
            // 提取note_id的辅助函数
            const extractNoteId = (fields: any): string => {
              const rawNoteId = fields?.note_id || fields?.node_id || fields?.['note_id'] || fields?.['node_id'] || fields?.['笔记ID']
              if (!rawNoteId) return ''
              if (Array.isArray(rawNoteId)) {
                if (rawNoteId.length > 0 && rawNoteId[0]?.text) {
                  return String(rawNoteId[0].text).trim()
                }
                return String(rawNoteId).trim()
              }
              if (typeof rawNoteId === 'object' && rawNoteId.text) {
                return String(rawNoteId.text).trim()
              }
              return String(rawNoteId).trim()
            }
            
            // 检查当前页记录是否有有效的note_id
            const hasValidNoteId = existingRecords.some(record => {
              const noteId = extractNoteId(record.fields || {})
              return noteId.length > 0
            })
            
            if (!hasValidNoteId) {
              console.log(`第 ${pageIndex} 页记录中没有有效的note_id，提前结束分页`)
              break
            }
            
            // 添加记录到allRecords
            allRecords.push(...existingRecords)
            
            console.log(`第 ${pageIndex} 页获取到 ${existingRecords.length} 条记录，累计获取 ${allRecords.length} 条`)
            
            // 更新分页参数，以has_more为准
            hasMore = !!listResult?.data?.has_more
            const nextPageToken = listResult?.data?.page_token || ''
            
            // 如果没有更多数据，停止翻页
            if (!hasMore) {
              console.log(`API返回has_more=false，停止翻页`)
              break
            }
            
            // 处理相同pageToken的情况
            if (pageToken === nextPageToken) {
              sameTokenCount++
              console.log(`pageToken没有变化，连续次数: ${sameTokenCount}/${maxSameTokenCount}`)
              
              // 继续翻页，增加相同pageToken的容忍次数
              if (sameTokenCount >= maxSameTokenCount) {
                console.log(`连续相同pageToken次数超过限制，停止翻页`)
                break
              }
              
              // 继续翻页，但使用相同的pageToken
              pageIndex++
              // 添加延迟，避免过快请求API
              await new Promise(resolve => setTimeout(resolve, 1000))
              continue
            } else {
              // 重置连续相同pageToken计数
              sameTokenCount = 0
            }
            
            pageToken = nextPageToken
            pageIndex++
          }
          
          if (pageIndex > maxPages) {
            console.log(`已达到最大页数限制(${maxPages}页)，停止翻页`)
          }
          
          console.log(`共获取到 ${allRecords.length} 条记录`)
          
          // 如果没有记录，跳过处理
          if (allRecords.length === 0) {
            console.log(`✓ 表格中没有记录，无需处理`)
            continue
          }
          
          // 4. 对当前表格数据进行去重，根据note_id
          console.log(`=== 开始对表格 ${table.name} 进行去重 ===`)
          
          // 提取note_id的辅助函数
          const extractNoteId = (fields: any): string => {
            const rawNoteId = fields?.note_id || fields?.node_id || fields?.['note_id'] || fields?.['node_id'] || fields?.['笔记ID'] || fields?.['noteId'] || fields?.['Note ID']
            if (!rawNoteId) return ''
            if (Array.isArray(rawNoteId)) {
              if (rawNoteId.length > 0 && rawNoteId[0]?.text) {
                return String(rawNoteId[0].text).trim()
              }
              return String(rawNoteId).trim()
            }
            if (typeof rawNoteId === 'object' && rawNoteId.text) {
              return String(rawNoteId.text).trim()
            }
            return String(rawNoteId).trim()
          }
          
          // 提取content的辅助函数
          const extractContent = (fields: any): string => {
            const rawContent = fields?.content || fields?.['内容'] || fields?.['contentText'] || ''
            return String(rawContent || '').trim()
          }
          
          // 第一步：收集所有带有note_id的记录
          const recordsWithNoteId = allRecords.filter(record => {
            const noteId = extractNoteId(record.fields || {})
            return noteId.length > 0
          })
          
          console.log(`原始记录数: ${allRecords.length}`)
          console.log(`带有note_id的记录数: ${recordsWithNoteId.length}`)
          
          // 第二步：按note_id分组所有记录
          const recordsByNoteId = new Map<string, any[]>()
          
          recordsWithNoteId.forEach((record) => {
            const noteId = extractNoteId(record.fields || {})
            if (!noteId) return // 跳过没有note_id的记录
            
            if (!recordsByNoteId.has(noteId)) {
              recordsByNoteId.set(noteId, [])
            }
            recordsByNoteId.get(noteId)?.push(record)
          })
          
          console.log(`按note_id分组后，共有 ${recordsByNoteId.size} 个唯一note_id`)
          
          // 第三步：为每个note_id选择要保留的记录
          const recordsToKeep: any[] = []
          
          recordsByNoteId.forEach((records, noteId) => {
            if (records.length === 0) return
            
            // 如果只有一条记录，直接保留
            if (records.length === 1) {
              recordsToKeep.push(records[0])
              console.log(`note_id=${noteId} 只有一条记录，直接保留`)
              return
            }
            
            // 获取记录创建时间的辅助函数
            const getCreatedTime = (record: any): Date => {
              // 尝试从不同位置获取创建时间
              const createdTime = record.created_time || 
                                 record._created_time || 
                                 record.fields?._created_time || 
                                 record.fields?.['_created_time'] || 
                                 '1970-01-01'
              return new Date(createdTime)
            }
            
            // 1. 先按是否有content分组
            const recordsWithContent = records.filter((record: any) => {
              const content = extractContent(record.fields || {})
              return content.length > 0
            })
            
            const recordsWithoutContent = records.filter((record: any) => {
              const content = extractContent(record.fields || {})
              return content.length === 0
            })
            
            console.log(`note_id=${noteId} 有 ${records.length} 条记录，其中有content: ${recordsWithContent.length} 条，无content: ${recordsWithoutContent.length} 条`)
            
            let recordToKeep: any
            
            if (recordsWithContent.length > 0) {
              // 2. 如果有带content的记录，从中选择创建时间最晚的
              recordToKeep = recordsWithContent.reduce((latest, current) => {
                const latestTime = getCreatedTime(latest)
                const currentTime = getCreatedTime(current)
                return currentTime > latestTime ? current : latest
              })
            } else {
              // 3. 如果没有带content的记录，从无content的记录中选择创建时间最晚的
              recordToKeep = recordsWithoutContent.reduce((latest, current) => {
                const latestTime = getCreatedTime(latest)
                const currentTime = getCreatedTime(current)
                return currentTime > latestTime ? current : latest
              })
            }
            
            // 4. 记录要保留的记录
            recordsToKeep.push(recordToKeep)
            
            const recordToKeepTime = getCreatedTime(recordToKeep)
            console.log(`note_id=${noteId} 保留的记录: record_id=${recordToKeep.record_id}, created_time=${recordToKeepTime.toISOString()}`)
          })
          
          // 第四步：收集所有需要保留的记录ID
          const keepRecordIds = new Set<string>()
          recordsToKeep.forEach(record => {
            keepRecordIds.add(record.record_id)
          })
          
          // 第五步：调试信息 - 检查前10条记录的note_id和record_id
          console.log(`=== 调试信息 - 前10条记录 ===`)
          recordsWithNoteId.slice(0, 10).forEach((record, index) => {
            const noteId = extractNoteId(record.fields || {})
            const recordId = record.record_id
            const isKept = keepRecordIds.has(recordId)
            console.log(`${index + 1}. note_id=${noteId}, record_id=${recordId}, kept=${isKept}`)
          })
          
          // 第六步：找出所有需要删除的记录
          // 只删除带有note_id的重复记录，保留每个note_id的一条记录
          const recordsToDelete: any[] = []
          const deletedNoteIds = new Set<string>()
          
          // 只处理带有note_id的记录，避免删除没有note_id的记录
          recordsWithNoteId.forEach(record => {
            const recordId = record.record_id
            const noteId = extractNoteId(record.fields || {})
            
            if (!keepRecordIds.has(recordId)) {
              recordsToDelete.push(record)
              deletedNoteIds.add(noteId)
            }
          })
          
          console.log(`=== 去重统计 ===`)
          console.log(`原始记录数: ${allRecords.length}`)
          console.log(`带有note_id的记录数: ${recordsWithNoteId.length}`)
          console.log(`唯一note_id数量: ${recordsByNoteId.size}`)
          console.log(`需要保留的记录数: ${recordsToKeep.length}`)
          console.log(`需要删除的重复记录数: ${recordsToDelete.length}`)
          console.log(`被删除的note_id数量: ${deletedNoteIds.size}`)
          
          // 安全检查：确保我们不会删除所有记录
          const expectedKeptRecords = recordsByNoteId.size
          const expectedDeletedRecords = recordsWithNoteId.length - expectedKeptRecords
          
          console.log(`=== 安全检查 ===`)
          console.log(`预期保留记录数: ${expectedKeptRecords}`)
          console.log(`预期删除记录数: ${expectedDeletedRecords}`)
          
          // 如果没有重复记录，跳过删除
          if (recordsToDelete.length === 0) {
            console.log(`✓ 表格中没有重复记录，无需删除`)
            continue
          }
          
          // 安全检查：确保删除的记录数符合预期
          if (recordsToDelete.length > expectedDeletedRecords + 50) {
            console.warn(`⚠️  删除记录数(${recordsToDelete.length})超过预期(${expectedDeletedRecords})，可能存在逻辑错误，跳过删除`)
            continue
          }
          
          // 安全检查：确保保留的记录数大于0
          if (recordsToKeep.length === 0) {
            console.warn(`⚠️  没有要保留的记录，可能存在逻辑错误，跳过删除`)
            continue
          }
          
          // 安全检查：确保保留的记录数等于唯一note_id数量
          if (Math.abs(recordsToKeep.length - expectedKeptRecords) > 10) {
            console.warn(`⚠️  保留记录数(${recordsToKeep.length})与预期(${expectedKeptRecords})不符，可能存在逻辑错误，跳过删除`)
            continue
          }
          
          // 最终确认
          console.log(`=== 最终确认 ===`)
          console.log(`准备删除 ${recordsToDelete.length} 条重复记录`)
          console.log(`准备保留 ${recordsToKeep.length} 条记录`)
          console.log(`每条note_id将保留一条记录`)
          
          // 5. 分批删除重复记录，每批最多500条
          const batchSize = 500
          let tableDeduplicated = 0
          
          for (let i = 0; i < recordsToDelete.length; i += batchSize) {
            const batchRecords = recordsToDelete.slice(i, i + batchSize)
            const batchRecordIds = batchRecords.map(record => record.record_id)
            console.log(`删除第 ${Math.floor(i / batchSize) + 1} 批重复记录，共 ${batchRecordIds.length} 条`)
            
            const deleteUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${table.table_id}/records/batch_delete`
            const deleteResponse = await fetchWithTimeout(deleteUrl, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${accessToken}`,
                'Content-Type': 'application/json'
              },
              body: JSON.stringify({
                records: batchRecordIds
              })
            })
            
            const deleteResponseText = await deleteResponse.text()
            console.log(`删除记录API响应: ${deleteResponse.status} ${deleteResponseText}`)
            
            if (!deleteResponse.ok) {
              throw new Error(`删除重复记录失败: ${deleteResponse.status} ${deleteResponseText}`)
            }
            
            const deleteResult = JSON.parse(deleteResponseText)
            console.log(`删除结果详细信息: ${JSON.stringify(deleteResult)}`)
            // 飞书API返回的是records数组，需要统计删除成功的数量
            const records = deleteResult.data?.records || []
            console.log(`删除结果中的records数组: ${JSON.stringify(records)}`)
            const deletedCount = records.filter((r: any) => r.deleted === true).length || 0
            console.log(`统计到的删除成功数量: ${deletedCount}`)
            tableDeduplicated += deletedCount
            totalDeduplicated += deletedCount
            console.log(`✓ 成功删除第 ${Math.floor(i / batchSize) + 1} 批重复记录，共 ${deletedCount} 条`)
          }
          
          console.log(`✓ 表格 ${table.name} 去重完成，共删除 ${tableDeduplicated} 条重复记录`)
        }
        
        console.log(`\n=== 飞书表格数据清理完成 ===`)
        console.log(`✓ 共处理 ${bloggerTables.length} 个博主表格，累计删除 ${totalDeduplicated} 条重复记录`)
        if (summaryTable) {
          console.log(`✓ 汇总表累计删除 ${summaryDeduplicated} 条重复记录`)
        }
        
        return {
          success: true,
          message: `成功处理 ${bloggerTables.length} 个博主表格，共删除 ${totalDeduplicated} 条重复记录`
        }
      } catch (error) {
        console.error(`=== 清理飞书表格数据失败 ===`)
        console.error('错误详情:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '清理飞书表格数据失败'
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
              crawl_time: note['爬取时间'] || '',
              crawl_status: note['爬取状态'] || ''
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

    // 读取飞书表格的汇总信息，获取博主的笔记数
    ipcMain.handle('feishu:readSummaryInfo', async (_, tableUrl: string) => {
      try {
        const config = this.configManager.getConfig()
        
        // 检查配置是否完整
        if (!config.appId || !config.appSecret) {
          return {
            success: false,
            error: '飞书API配置不完整，请先在设置中配置App ID和App Secret'
          }
        }
        
        console.log(`=== 开始读取飞书表格汇总信息 ===`)
        console.log(`表格链接: ${tableUrl}`)
        
        // 获取飞书访问令牌（优先使用缓存）
        const accessToken = await this.getCachedAccessToken(config.appId, config.appSecret)
        
        // 解析飞书链接
        const { docId, sheetId, type } = this.parseFeishuDocUrl(tableUrl)
        
        // 调用飞书API读取表格数据
        const rawData = await this.fetchSheetData(accessToken, docId, sheetId, type)
        
        // 转换飞书表格数据为前端期望的格式
        const formattedData = this.formatFeishuData(rawData, type)
        
        console.log(`✓ 成功读取飞书表格数据，共 ${formattedData.length} 条`)
        
        // 读取每个博主的笔记数
        const bloggerNoteCounts = []
        
        for (const blogger of formattedData) {
          // 查找对应博主的笔记列表数据表
          const noteTableName = `博主_${blogger.bloggerId}`
          
          // 获取所有数据表列表
          const tablesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables`
          const tablesResponse = await fetch(tablesUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            }
          })
          
          if (!tablesResponse.ok) {
            console.warn(`获取数据表列表失败: ${tablesResponse.status} ${await tablesResponse.text()}`)
            continue
          }
          
          const tablesData = JSON.parse(await tablesResponse.text())
          const tables = tablesData?.data?.items || []
          
          // 查找对应博主的笔记列表数据表
          const noteTable = tables.find((table: any) => table.name === noteTableName)
          
          if (!noteTable) {
            console.log(`未找到博主 ${blogger.bloggerId} 的笔记列表数据表`)
            bloggerNoteCounts.push({
              bloggerId: blogger.bloggerId,
              noteCount: 0
            })
            continue
          }
          
          // 获取笔记列表数据表中的笔记数量
          const searchNotesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTable.table_id}/records/search`
          const notesSearchResponse = await fetch(searchNotesUrl, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              page_size: 1 // 只需要知道数量，不需要具体数据
            })
          })
          
          if (!notesSearchResponse.ok) {
            console.warn(`获取笔记列表数据失败: ${notesSearchResponse.status} ${await notesSearchResponse.text()}`)
            continue
          }
          
          const notesSearchData = JSON.parse(await notesSearchResponse.text())
          const noteCount = notesSearchData?.data?.total || 0
          
          bloggerNoteCounts.push({
            bloggerId: blogger.bloggerId,
            noteCount: noteCount
          })
          
          console.log(`博主 ${blogger.bloggerId} 的笔记数: ${noteCount}`)
        }
        
        console.log(`✓ 成功读取 ${bloggerNoteCounts.length} 个博主的笔记数`)
        console.log(`=== 飞书表格汇总信息读取完成 ===`)
        
        return {
          success: true,
          data: bloggerNoteCounts
        }
      } catch (error) {
        console.error('=== 读取飞书表格汇总信息失败 ===')
        console.error('错误详情:', error)
        return {
          success: false,
          error: error instanceof Error ? error.message : '读取飞书表格汇总信息失败'
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
      
      const recordsUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${appToken}/tables/${tableId}/records`
      console.log('调用的API地址:', recordsUrl)
      
      const allItems: any[] = []
      let hasMore = true
      let pageToken = ''
      let pageIndex = 1
      const maxPages = 50
      let sameTokenCount = 0
      const maxSameTokenCount = 3
      
      while (hasMore && pageIndex <= maxPages) {
        const url = new URL(recordsUrl)
        url.searchParams.set('page_size', '1000')
        if (pageToken) {
          url.searchParams.set('page_token', pageToken)
        }
        
        const response = await fetchWithTimeout(url.toString(), {
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json'
          }
        })
        
        const responseText = await response.text()
        console.log(`飞书Bitable API响应(第 ${pageIndex} 页):`, response.status, response.statusText, responseText)
        
        if (!response.ok) {
          throw new Error(`读取多维表格数据失败: ${response.status} ${response.statusText} - ${responseText}`)
        }
        
        const responseData = JSON.parse(responseText)
        if (responseData?.code !== 0 || !responseData?.data) {
          throw new Error(`读取多维表格数据失败: ${responseData?.msg || '未知错误'}`)
        }
        
        const items = responseData?.data?.items || []
        allItems.push(...items)
        
        hasMore = !!responseData?.data?.has_more
        const nextPageToken = responseData?.data?.page_token || ''
        
        if (!hasMore) {
          break
        }
        
        if (pageToken === nextPageToken) {
          sameTokenCount += 1
          if (sameTokenCount >= maxSameTokenCount) {
            console.warn('pageToken连续未变化，停止翻页')
            break
          }
        } else {
          sameTokenCount = 0
        }
        
        pageToken = nextPageToken
        pageIndex += 1
      }
      
      if (pageIndex > maxPages) {
        console.warn(`分页次数超过 ${maxPages} 页，停止获取`) 
      }
      
      return {
        data: {
          items: allItems
        }
      }
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
   * 检查博主数据是否需要处理
   * 1. 检查是否有对应博主的汇总信息
   * 2. 检查是否有对应博主的笔记列表数据表
   * 3. 比较汇总信息中的笔记数量和爬虫开始前的总笔记数量
   * 4. 不一致时比较汇总和笔记列表数据表的数量
   */
  private async checkIfBloggerNeedsProcessing(accessToken: string, docId: string, bloggerId: string): Promise<boolean> {
    try {
      console.log(`=== 检查博主 ${bloggerId} 是否需要处理 ===`)
      
      // 1. 获取所有数据表列表
      const tablesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables`
      const tablesResponse = await fetch(tablesUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      })
      
      if (!tablesResponse.ok) {
        console.warn(`获取数据表列表失败: ${tablesResponse.status} ${await tablesResponse.text()}`)
        return true // 失败时默认需要处理
      }
      
      const tablesData = JSON.parse(await tablesResponse.text())
      const tables = tablesData?.data?.items || []
      
      // 2. 查找博主信息汇总表 - 改进查找逻辑，更灵活匹配
      const summaryTable = tables.find((table: any) => {
        const tableName = (table.name || '').toLowerCase()
        return tableName.includes('汇总') || 
               tableName.includes('博主') || 
               tableName.includes('blogger') ||
               tableName.includes('summary')
      })
      
      if (!summaryTable) {
        console.log(`未找到博主信息汇总表，需要处理博主 ${bloggerId}`)
        return true
      }
      
      // 3. 在汇总表中查找该博主的记录
      const searchSummaryUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${summaryTable.table_id}/records/search`
      const summarySearchResponse = await fetch(searchSummaryUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          filter: {
            conditions: [{
              field_name: 'blogger_id',
              operator: 'eq',
              value: bloggerId
            }]
          }
        })
      })
      
      if (!summarySearchResponse.ok) {
        console.warn(`在汇总表中查找博主记录失败: ${summarySearchResponse.status} ${await summarySearchResponse.text()}`)
        return true
      }
      
      const summarySearchData = JSON.parse(await summarySearchResponse.text())
      const bloggerSummary = summarySearchData?.data?.items?.[0]
      
      if (!bloggerSummary) {
        console.log(`在汇总表中未找到博主 ${bloggerId} 的记录，需要处理`)
        return true
      }
      
      // 4. 获取汇总表中的笔记数量
      const summaryNoteCount = Number(bloggerSummary.fields?.note_count || bloggerSummary.fields?.['笔记数量'] || 0)
      console.log(`汇总表中博主 ${bloggerId} 的笔记数量: ${summaryNoteCount}`)
      
      // 5. 查找对应博主的笔记列表数据表
      const noteTableName = `博主_${bloggerId}`
      const noteTable = tables.find((table: any) => table.name === noteTableName)
      
      if (!noteTable) {
        console.log(`未找到博主 ${bloggerId} 的笔记列表数据表，需要处理`)
        return true
      }
      
      // 6. 获取笔记列表数据表中的笔记数量
      const searchNotesUrl = `https://open.feishu.cn/open-apis/bitable/v1/apps/${docId}/tables/${noteTable.table_id}/records/search`
      const notesSearchResponse = await fetch(searchNotesUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          page_size: 1 // 只需要知道数量，不需要具体数据
        })
      })
      
      if (!notesSearchResponse.ok) {
        console.warn(`获取笔记列表数据失败: ${notesSearchResponse.status} ${await notesSearchResponse.text()}`)
        return true
      }
      
      const notesSearchData = JSON.parse(await notesSearchResponse.text())
      const tableNoteCount = notesSearchData?.data?.total || 0
      console.log(`笔记列表数据表中博主 ${bloggerId} 的笔记数量: ${tableNoteCount}`)
      
      // 7. 比较数量，决定是否需要处理
      if (summaryNoteCount === tableNoteCount && summaryNoteCount > 0) {
        console.log(`博主 ${bloggerId} 的汇总信息和笔记列表数量一致，无需重复处理`)
        return false
      } else {
        console.log(`博主 ${bloggerId} 的汇总信息和笔记列表数量不一致，需要处理`)
        return true
      }
    } catch (error) {
      console.error(`检查博主 ${bloggerId} 是否需要处理时发生错误:`, error)
      return true // 发生错误时默认需要处理
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
        
        // 尝试中文字段名和英文字段名
        if (fields['博主ID']) bloggerId = extractFieldValue(fields['博主ID'])
        else if (fields['博主id']) bloggerId = extractFieldValue(fields['博主id'])
        else if (fields['博主id（必填）']) bloggerId = extractFieldValue(fields['博主id（必填）'])
        else if (fields['bloggerId']) bloggerId = extractFieldValue(fields['bloggerId'])
        else if (fields['blogger_id']) bloggerId = extractFieldValue(fields['blogger_id']) // 添加对blogger_id的支持
        else if (fields['id']) bloggerId = extractFieldValue(fields['id'])
        
        if (fields['分享链接']) shareUrl = extractFieldValue(fields['分享链接'])
        else if (fields['主页链接']) shareUrl = extractFieldValue(fields['主页链接'])
        else if (fields['主页链接（必填）']) shareUrl = extractFieldValue(fields['主页链接（必填）'])
        else if (fields['shareUrl']) shareUrl = extractFieldValue(fields['shareUrl'])
        else if (fields['share_url']) shareUrl = extractFieldValue(fields['share_url']) // 添加对share_url的支持
        else if (fields['链接']) shareUrl = extractFieldValue(fields['链接'])
        else if (fields['url']) shareUrl = extractFieldValue(fields['url'])
        
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
