import React, { useState } from 'react'
import { Button } from '@/app/components/ui/button'
import { Input } from '@/app/components/ui/input'
import { Label } from '@/app/components/ui/label'
import { Card } from '@/app/components/ui/card'
import { Separator } from '@/app/components/ui/separator'
import { Loader2, Save } from 'lucide-react'
import { toast } from 'sonner'

interface FeishuData {
  id: string
  bloggerId: string
  shareUrl: string
}

interface BloggerUserInfo {
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
  tags?: string[]
}

interface ProcessedBloggerData {
  bloggerId: string
  shareUrl: string
  notes: any[]
  user?: BloggerUserInfo
  tags?: string[]
}

interface FeishuPageProps {
  onNavigate: (page: 'history' | 'settings' | 'feishu') => void
}

export default function FeishuPage({ onNavigate }: FeishuPageProps) {
  const tmpUrl = 'https://test-d1grprfttmra.feishu.cn/base/Ei4xb0SIQaH1DXsOY8AcSoFlnGf?from=from_copylink'
  const [readTableUrl, setReadTableUrl] = useState(tmpUrl)
  const [writeTableUrl, setWriteTableUrl] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [data, setData] = useState<FeishuData[]>([])
  const [error, setError] = useState('')
  const [isConfigured, setIsConfigured] = useState(false)
  
  // 页面加载时检查飞书配置
  React.useEffect(() => {
    checkFeishuConfig()
  }, [])
  
  // 工作进度状态
  const [isWorking, setIsWorking] = useState(false)
  const [currentBlogger, setCurrentBlogger] = useState<number>(0)
  const [totalBloggers, setTotalBloggers] = useState<number>(0)
  const [currentNote, setCurrentNote] = useState<number>(0)
  const [totalNotes, setTotalNotes] = useState<number>(0)
  const [progress, setProgress] = useState<number>(0)
  
  // 结果状态
  const [result, setResult] = useState<{
    success: boolean
    message: string
    filePath?: string
  } | null>(null)

  const [localExcelPath, setLocalExcelPath] = useState('')
  const [processedData, setProcessedData] = useState<ProcessedBloggerData[]>([])
  const [isManualWriting, setIsManualWriting] = useState(false)

  const parseTagList = (value: any): string[] => {
    if (!value) return []
    if (Array.isArray(value)) {
      return value
        .map(tag => {
          if (typeof tag === 'string') {
            return tag.trim()
          }
          if (tag && typeof tag === 'object') {
            if (typeof tag.name === 'string') {
              return tag.name.trim()
            }
            return String(tag).trim()
          }
          return String(tag || '').trim()
        })
        .filter(tag => tag.length > 0)
    }
    return String(value)
      .split(/[，,]/)
      .map(tag => tag.trim())
      .filter(tag => tag.length > 0)
  }

  const normalizeUserInfo = (userData?: any, notes?: any[]): BloggerUserInfo | undefined => {
    const toNumber = (val: any): number | undefined => {
      if (val === undefined || val === null || val === '') return undefined
      const num = Number(val)
      return Number.isNaN(num) ? undefined : num
    }

    if (userData) {
      return {
        nickname: userData.nickname || userData.username || '',
        avatar: userData.avatar || userData.avatar_url || '',
        uniqueId: userData.red_id || userData.uniqueId || '',
        gender: userData.gender || '',
        ipLocation: userData.ip_location || userData.ipLocation || '',
        desc: userData.desc || '',
        followingCount: toNumber(userData.follows ?? userData.followingCount) ?? 0,
        followerCount: toNumber(userData.fans ?? userData.followerCount) ?? 0,
        likedCount: toNumber(userData.interaction ?? userData.likedCount) ?? 0,
        collectedCount: toNumber(userData.collectedCount ?? userData.interaction ?? userData.likedCount) ?? 0,
        tags: parseTagList(userData.tags)
      }
    }

    if (notes && notes.length > 0) {
      const sample = notes.find(note => note?.nickname || note?.author_name || note?.avatar) || notes[0]
      if (!sample) return undefined
      return {
        nickname: sample.nickname || sample.author_name || '',
        avatar: sample.avatar || sample.author_avatar || '',
        uniqueId: sample.red_id || '',
        gender: sample.gender || '',
        ipLocation: sample.ip_location || '',
        desc: '',
        tags: parseTagList(sample.tags)
      }
    }

    return undefined
  }
  
  // 日志状态
  const [logs, setLogs] = useState<string[]>([])

  // 检查飞书配置是否已设置
  const checkFeishuConfig = async () => {
    try {
      const config = await window.conveyor.feishu.getConfig()
      // 只需要App ID和App Secret即可，文档Token和Sheet ID是可选的
      setIsConfigured(!!config.appId && !!config.appSecret)
      
      // 从配置中读取保存的飞书链接
      if (config.readTableUrl) {
        setReadTableUrl(config.readTableUrl)
      }
      if (config.writeTableUrl) {
        setWriteTableUrl(config.writeTableUrl)
      }
    } catch (err) {
      console.error('检查飞书配置失败:', err)
      setIsConfigured(false)
    }
  }
  
  // 保存飞书链接到配置
  const saveFeishuUrlsToConfig = async () => {
    try {
      const config = await window.conveyor.feishu.getConfig()
      // 更新配置，保存飞书链接
      await window.conveyor.feishu.setConfig({
        ...config,
        readTableUrl,
        writeTableUrl
      })
    } catch (err) {
      console.error('保存飞书链接失败:', err)
    }
  }

  // 从飞书表格读取数据
  const fetchFeishuTableData = async () => {
    if (!isConfigured) {
      toast.error('请先在设置中配置飞书API')
      return
    }

    setIsLoading(true)
    setError('')
    
    try {
      // 保存飞书链接到配置
      await saveFeishuUrlsToConfig()
      
      // 调用主进程的飞书API读取数据
      const result = await window.conveyor.feishu.fetchTableData(readTableUrl)
      
      if (result.success) {
        setData(result.data || [])
        toast.success(`成功读取到 ${result.data?.length || 0} 条数据`)
      } else {
        setError(result.error || '读取飞书表格数据失败')
        toast.error(result.error || '读取飞书表格数据失败')
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '读取飞书表格数据失败'
      setError(errorMsg)
      toast.error(errorMsg)
      console.error('读取飞书表格失败:', err)
    } finally {
      setIsLoading(false)
    }
  }

  // 开始工作，读取博主笔记列表和详情信息，生成Excel表格
  const handleStartWork = async () => {
    if (data.length === 0) {
      toast.error('请先读取飞书表格数据')
      return
    }

    // 检查写入表格链接是否存在
    if (!writeTableUrl) {
      toast.error('请填写写入飞书多维表格链接')
      return
    }
    
    // 保存飞书链接到配置
    await saveFeishuUrlsToConfig()

    // 重置状态
    setIsLoading(true)
    setIsWorking(true)
    setError('')
    setResult(null)
    setCurrentBlogger(0)
    setTotalBloggers(data.length)
    setCurrentNote(0)
    setTotalNotes(0)
    setProgress(0)
    setLocalExcelPath('')
    setProcessedData([])
    
    // 读取写入表格的现有数据，用于去重
    let existingBloggers: string[] = []
    try {
      console.log('开始读取写入表格的现有数据...')
      const existingDataResult = await window.conveyor.feishu.fetchTableData(writeTableUrl)
      if (existingDataResult.success && existingDataResult.data) {
        console.log('成功读取写入表格的现有数据，共', existingDataResult.data.length, '条')
        // 提取现有博主ID列表
        existingBloggers = existingDataResult.data.map((item: any) => item.bloggerId).filter((id: string) => id)
        console.log('现有博主ID列表:', existingBloggers)
      } else {
        console.warn('读取写入表格现有数据失败或无数据:', existingDataResult.error)
      }
    } catch (err) {
      console.error('读取写入表格现有数据时发生错误:', err)
      // 不中断流程，继续执行
    }
    
    try {
      toast.success('开始处理博主数据...')
      
      // 遍历所有博主数据，读取笔记列表和详情信息，跳过已处理的博主
      const allBloggerData: ProcessedBloggerData[] = []
      // 过滤掉已经存在的博主，进行去重
      const filteredData = data.filter(blogger => !existingBloggers.includes(blogger.bloggerId))
      const totalBloggersCount = filteredData.length
      
      if (totalBloggersCount === 0) {
        console.log('所有博主都已处理过，无需重复处理')
        toast.success('所有博主都已处理过，无需重复处理')
        setResult({
          success: true,
          message: '所有博主都已处理过，无需重复处理'
        })
        setIsLoading(false)
        setIsWorking(false)
        setProgress(100)
        return
      }
      
      console.log(`去重后需要处理的博主数量: ${totalBloggersCount}`)
      
      for (let i = 0; i < totalBloggersCount; i++) {
        const blogger = filteredData[i]
        setCurrentBlogger(i + 1)
        setProgress(Math.round((i / totalBloggersCount) * 100))
        setTotalNotes(0)
        setCurrentNote(0)
        
        console.log(`=== 开始处理博主 ${blogger.bloggerId} (${i + 1}/${totalBloggersCount}) ===`)
        
        // 1. 调用API读取博主笔记列表
        console.log(`开始读取博主 ${blogger.bloggerId} 的笔记列表...`)
        const notesResult = await window.conveyor.feishu.fetchBloggerNotes(blogger.bloggerId, blogger.shareUrl)
        
        if (notesResult.success) {
          console.log(`成功读取博主 ${blogger.bloggerId} 的笔记列表，共 ${notesResult.data?.length || 0} 条笔记`)
          console.log('直接使用爬虫返回的笔记详情数据，无需额外请求')
          
          const notes = notesResult.data || []
          setTotalNotes(notes.length)
          setCurrentNote(notes.length)
          setProgress(Math.round(((i + 1) / totalBloggersCount) * 100))

          const userProfile = normalizeUserInfo(notesResult.user, notes)
          
          // 添加博主数据到结果数组
          allBloggerData.push({
            bloggerId: blogger.bloggerId,
            shareUrl: blogger.shareUrl,
            notes,
            user: userProfile,
            tags: userProfile?.tags || []
          })
          
          toast.success(`成功处理博主 ${blogger.bloggerId}，共读取 ${notes.length} 条笔记详情`)
        } else {
          console.error(`读取博主 ${blogger.bloggerId} 的笔记列表失败: ${notesResult.error}`)
          toast.error(`处理博主 ${blogger.bloggerId} 失败: ${notesResult.error}`)
        }
        
        // 获取读取间隔配置
        const config = await window.conveyor.spider.getConfig()
        const interval = config?.feishu?.readInterval || 3000 // 默认3秒
        
        // 等待指定的间隔时间
        if (i < totalBloggersCount - 1) {
          console.log(`等待 ${interval} 毫秒后继续处理下一个博主...`)
          await new Promise(resolve => setTimeout(resolve, interval))
        }
      }
      
      setProgress(100)
      console.log('=== 所有博主数据处理完成 ===')
      console.log('处理结果:', allBloggerData)
      setProcessedData(allBloggerData)
      
      // 3. 生成Excel表格，每个博主一个sheet
      console.log('开始生成Excel表格...')
      const excelResult = await window.conveyor.feishu.generateExcel(allBloggerData)
      
      let excelMessage = ''
      if (excelResult.success) {
        console.log('Excel表格生成成功:', excelResult.filePath)
        toast.success(`Excel表格生成成功，保存路径: ${excelResult.filePath}`)
        excelMessage = `，生成Excel表格成功`
        if (excelResult.filePath) {
          setLocalExcelPath(excelResult.filePath)
        }
      } else {
        console.error('Excel表格生成失败:', excelResult.error)
        toast.error(`Excel表格生成失败: ${excelResult.error}`)
        excelMessage = `，Excel表格生成失败: ${excelResult.error}`
      }
      
      // 4. 如果提供了写入表格链接，将数据写入飞书多维表格
      let writeMessage = ''
      if (writeTableUrl) {
        try {
          console.log('开始将数据写入飞书多维表格...')
          console.log('写入表格链接:', writeTableUrl)
          const writeResult = await window.conveyor.feishu.writeTableData(writeTableUrl, allBloggerData)
          
          if (writeResult.success) {
            console.log('数据写入飞书多维表格成功')
            toast.success('数据写入飞书多维表格成功')
            writeMessage = `，写入飞书表格成功`
          } else {
            console.error('数据写入飞书多维表格失败:', writeResult.error)
            toast.error(`数据写入飞书多维表格失败: ${writeResult.error}`)
            writeMessage = `，写入飞书表格失败: ${writeResult.error}`
          }
        } catch (err) {
          const errorMsg = err instanceof Error ? err.message : '写入飞书表格失败'
          console.error('写入飞书表格失败:', errorMsg)
          toast.error(`写入飞书表格失败: ${errorMsg}`)
          writeMessage = `，写入飞书表格失败: ${errorMsg}`
        }
      }
      
      // 设置最终结果
      setResult({
        success: excelResult.success && (!writeTableUrl || true), // 如果没有提供写入链接，默认成功
        message: `成功处理 ${allBloggerData.length} 个博主${excelMessage}${writeMessage}`,
        filePath: excelResult.success ? excelResult.filePath : undefined
      })
      
      toast.success('所有博主数据处理完成！')
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '处理博主数据失败'
      setError(errorMsg)
      setResult({
        success: false,
        message: errorMsg
      })
      toast.error(errorMsg)
      console.error('处理博主数据失败:', err)
    } finally {
      setIsLoading(false)
      setIsWorking(false)
      setProgress(100)
    }
  }

  const handleManualWrite = async () => {
    if (!writeTableUrl) {
      toast.error('请先填写写入飞书多维表格链接')
      return
    }

    const manualPath = localExcelPath.trim()

    if (!manualPath && processedData.length === 0) {
      toast.error('暂无可写入的数据，请先处理一次或填写Excel路径')
      return
    }

    setIsManualWriting(true)
    try {
      let dataToWrite = processedData

      if (manualPath) {
        console.log('从本地Excel读取数据，准备手动写入飞书...')
        const parsedResult = await window.conveyor.feishu.loadExcelSummary(manualPath)

        if (!parsedResult.success || !parsedResult.data || parsedResult.data.length === 0) {
          const errorMsg = parsedResult.error || '未能从Excel解析到数据'
          toast.error(errorMsg)
          return
        }

        dataToWrite = parsedResult.data as ProcessedBloggerData[]
        setProcessedData(parsedResult.data as ProcessedBloggerData[])
      }

      if (dataToWrite.length === 0) {
        toast.error('暂无可写入的数据，请先处理数据')
        return
      }

      console.log('手动写入飞书多维表格...')
      const writeResult = await window.conveyor.feishu.writeTableData(writeTableUrl, dataToWrite)

      if (writeResult.success) {
        toast.success('数据已手动写入飞书多维表格')
      } else {
        toast.error(`手动写入失败: ${writeResult.error}`)
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : '手动写入飞书表格失败'
      console.error('手动写入飞书表格失败:', errorMsg)
      toast.error(errorMsg)
    } finally {
      setIsManualWriting(false)
    }
  }

  // 添加日志到页面
  const addLog = (message: string) => {
    setLogs(prevLogs => {
      const newLogs = [...prevLogs, `${new Date().toLocaleTimeString()}: ${message}`]
      // 只保留最近100条日志，避免内存占用过大
      if (newLogs.length > 100) {
        return newLogs.slice(-100)
      }
      return newLogs
    })
  }

  // 组件挂载时检查飞书配置并设置日志捕获
  useState(() => {
    checkFeishuConfig()
    
    // 重写console.log，将日志同时输出到控制台和页面
    const originalLog = console.log
    console.log = (...args) => {
      originalLog.apply(console, args)
      // 将日志格式化为字符串
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2)
          } catch {
            return String(arg)
          }
        }
        return String(arg)
      }).join(' ')
      addLog(message)
    }
    
    // 重写console.error，将错误日志也输出到页面
    const originalError = console.error
    console.error = (...args) => {
      originalError.apply(console, args)
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2)
          } catch {
            return String(arg)
          }
        }
        return String(arg)
      }).join(' ')
      addLog(`ERROR: ${message}`)
    }
    
    // 重写console.warn，将警告日志也输出到页面
    const originalWarn = console.warn
    console.warn = (...args) => {
      originalWarn.apply(console, args)
      const message = args.map(arg => {
        if (typeof arg === 'object') {
          try {
            return JSON.stringify(arg, null, 2)
          } catch {
            return String(arg)
          }
        }
        return String(arg)
      }).join(' ')
      addLog(`WARN: ${message}`)
    }
  })

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold tracking-tight">飞书集成</h2>
        <p className="text-muted-foreground mt-1">读取飞书表格中的博主数据</p>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="readTableUrl">飞书多维表格链接（读取）</Label>
            <div className="flex gap-2">
              <Input
                id="readTableUrl"
                placeholder=""
                value={readTableUrl}
                onChange={(e) => setReadTableUrl(e.target.value)}
                className="flex-1"
              />
              <Button onClick={fetchFeishuTableData} disabled={isLoading}>
                {isLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : '读取数据'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              表格需包含两列：博主ID和博主主页分享链接
            </p>
          </div>
          
          <div className="space-y-2">
            <Label htmlFor="writeTableUrl">飞书多维表格链接（写入）</Label>
            <Input
              id="writeTableUrl"
              placeholder=""
              value={writeTableUrl}
              onChange={(e) => setWriteTableUrl(e.target.value)}
              className="flex-1"
            />
            <p className="text-xs text-muted-foreground">
              处理完成后的数据将写入此表格（可选）
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="localExcelPath">手动同步文件路径</Label>
            <div className="flex gap-2">
              <Input
                id="localExcelPath"
                value={localExcelPath}
                onChange={(e) => setLocalExcelPath(e.target.value)}
                className="flex-1"
                placeholder="/Users/.../feishu-notes.xlsx"
              />
              <Button
                type="button"
                variant="outline"
                onClick={handleManualWrite}
                disabled={isManualWriting || (!localExcelPath.trim() && processedData.length === 0)}
              >
                {isManualWriting ? <Loader2 className="w-4 h-4 animate-spin" /> : '手动写入飞书'}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              开始工作完成后会自动填入最新的Excel路径，也可手动输入已有地址来再次同步到飞书
            </p>
          </div>

          {!isConfigured && (
            <div className="p-3 rounded-md bg-yellow-50 text-yellow-600 text-sm space-y-2">
              <div>⚠️ 飞书API尚未配置，请先在设置中配置飞书App ID和App Secret</div>
              <Button 
                variant="default" 
                size="sm"
                onClick={() => onNavigate('settings')}
                className="mt-2"
              >
                前往设置页面
              </Button>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-md bg-red-50 text-red-600 text-sm">
              {error}
            </div>
          )}
        </div>
      </Card>

      {data.length > 0 && (
        <>
          <Card>
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">读取到的数据</h3>
                <Button onClick={() => handleStartWork()}>开始工作</Button>
              </div>
              <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">序号</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">博主ID</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">博主主页链接</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((item, index) => (
                    <tr key={item.id} className="border-b hover:bg-muted/50">
                      <td className="py-3 px-4">{index + 1}</td>
                      <td className="py-3 px-4">{item.bloggerId}</td>
                      <td className="py-3 px-4">
                        <a 
                          href={item.shareUrl} 
                          target="_blank" 
                          rel="noopener noreferrer"
                          className="text-primary hover:underline"
                        >
                          {item.shareUrl}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
              <div className="mt-4 text-sm text-muted-foreground">
                共读取到 {data.length} 条博主数据
              </div>
            </div>
          </Card>

          {/* 工作进度显示 */}
          {isWorking && (
            <Card className="mt-4">
              <div className="p-6">
                <h3 className="text-lg font-medium mb-4">工作进度</h3>
                <div className="space-y-4">
                  <div>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium">总体进度</span>
                      <span className="text-sm font-medium">{progress}%</span>
                    </div>
                    <div className="w-full bg-secondary rounded-full h-2.5">
                      <div 
                        className="bg-primary h-2.5 rounded-full transition-all duration-300"
                        style={{ width: `${progress}%` }}
                      ></div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="bg-secondary/20 p-3 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">当前博主</div>
                      <div className="text-lg font-medium">{currentBlogger}/{totalBloggers}</div>
                    </div>
                    <div className="bg-secondary/20 p-3 rounded-lg">
                      <div className="text-xs text-muted-foreground mb-1">当前笔记</div>
                      <div className="text-lg font-medium">{currentNote}/{totalNotes}</div>
                    </div>
                  </div>
                  <div className="bg-blue-50 border border-blue-200 text-blue-800 p-3 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span className="text-sm">正在处理数据，请稍候...</span>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}
          
          {/* 日志显示 */}
          {(isWorking || logs.length > 0) && (
            <Card className="mt-4">
              <div className="p-6">
                <h3 className="text-lg font-medium mb-4">实时日志</h3>
                <div className="bg-secondary/10 rounded-lg p-4 max-h-60 overflow-y-auto text-sm font-mono space-y-2">
                  {logs.length === 0 ? (
                    <div className="text-muted-foreground italic">暂无日志</div>
                  ) : (
                    logs.map((log, index) => (
                      <div key={index} className="whitespace-pre-wrap break-all">
                        {log}
                      </div>
                    ))
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* 结果显示 */}
          {result && (
            <Card className="mt-4">
              <div className="p-6">
                <h3 className="text-lg font-medium mb-4">处理结果</h3>
                <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50 text-green-800 border border-green-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                  <div className="flex items-start gap-3">
                    {result.success ? (
                      <div className="mt-0.5 text-green-600">✅</div>
                    ) : (
                      <div className="mt-0.5 text-red-600">❌</div>
                    )}
                    <div>
                      <div className="font-medium">{result.success ? '处理成功' : '处理失败'}</div>
                      <div className="text-sm mt-1">{result.message}</div>
                      {result.filePath && result.success && (
                        <div className="mt-2">
                          <span className="text-sm text-muted-foreground">保存路径:</span>
                          <div className="mt-1 text-sm font-medium break-all">{result.filePath}</div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          )}
        </>
      )}

      <Card className="p-6">
        <div className="space-y-4">
          <h3 className="text-lg font-medium">使用说明</h3>
          <Separator />
          <div className="space-y-3 text-sm">
            <div className="flex items-start gap-2">
              <div className="mt-1 text-primary font-bold">1.</div>
              <div>
                <strong>配置飞书API</strong>：在设置页面配置飞书App ID和App Secret，获取API访问权限
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-1 text-primary font-bold">2.</div>
              <div>
                <strong>准备飞书表格</strong>：创建或使用现有飞书表格，确保包含两列：博主ID和博主主页分享链接
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-1 text-primary font-bold">3.</div>
              <div>
                <strong>获取表格链接</strong>：在飞书文档中点击分享，获取可编辑的链接
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-1 text-primary font-bold">4.</div>
              <div>
                <strong>读取数据</strong>：在本页面粘贴链接并点击"读取数据"按钮
              </div>
            </div>
            <div className="flex items-start gap-2">
              <div className="mt-1 text-primary font-bold">5.</div>
              <div>
                <strong>使用数据</strong>：读取到的数据可以用于后续的博主笔记下载任务
              </div>
            </div>
          </div>
        </div>
      </Card>
    </div>
  )
}
