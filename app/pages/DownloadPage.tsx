import { useState } from 'react'
import { Download, FileText, User, Search, Loader2, Sparkles, Save, FileSpreadsheet, Image, Video } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { Textarea } from '../components/ui/textarea'
import { Button } from '../components/ui/button'
import { toast } from 'sonner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select'
import { Separator } from '../components/ui/separator'
import { Badge } from '../components/ui/badge'

type TaskType = 'notes' | 'user' | 'search'
type SaveMode = 'excel' | 'media' | 'all'

interface DownloadPageProps {
  onDownloadStarted?: () => void
}

export default function DownloadPage({ onDownloadStarted }: DownloadPageProps = {}) {
  const [taskType, setTaskType] = useState<TaskType>('search')
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Notes task state
  const [noteUrls, setNoteUrls] = useState('')

  // User task state
  const [userUrl, setUserUrl] = useState('')

  // Search task state
  const [searchQuery, setSearchQuery] = useState('')
  const [searchCount, setSearchCount] = useState(10)
  const [sortType, setSortType] = useState('0')
  const [noteType, setNoteType] = useState('0')
  const [timeRange, setTimeRange] = useState('0')

  // Common state
  const [saveMode, setSaveMode] = useState<SaveMode>('all')
  const [excelName, setExcelName] = useState('')
  const [saveVideo, setSaveVideo] = useState(true)
  const [saveImage, setSaveImage] = useState(true)

  const handleDownload = async () => {
    setIsSubmitting(true)
    try {
      const config = await window.conveyor.spider.getConfig()

      if (!config.cookie) {
        toast.error('请先在设置页面配置Cookie!')
        return
      }

      let params: any = {}

      if (taskType === 'notes') {
        const urls = noteUrls
          .split('\n')
          .map((url) => url.trim())
          .filter((url) => url)

        if (urls.length === 0) {
          toast.error('请输入至少一个笔记URL!')
          return
        }
        params = { notes: urls }
      } else if (taskType === 'user') {
        if (!userUrl.trim()) {
          toast.error('请输入用户主页URL!')
          return
        }
        params = { userUrl: userUrl.trim() }
      } else if (taskType === 'search') {
        if (!searchQuery.trim()) {
          toast.error('请输入搜索关键词!')
          return
        }
        params = {
          query: searchQuery.trim(),
          requireNum: searchCount,
          sortType: parseInt(sortType),
          noteType: parseInt(noteType),
          noteTime: parseInt(timeRange),
          noteRange: 0,
          posDistance: 0,
        }
      }

      const mediaTypes: ('video' | 'image')[] = []
      if (saveVideo) mediaTypes.push('video')
      if (saveImage) mediaTypes.push('image')

      const taskConfig = {
        taskType,
        params,
        config: {
          cookie: config.cookie,
          saveOptions: {
            mode: saveMode,
            excelName: excelName || (taskType === 'search' ? searchQuery : '数据'),
            mediaTypes,
          },
          paths: config.paths,
          proxy: config.proxy.enabled ? config.proxy.url : undefined,
        }
      }

      // Add to queue
      const addResult = await window.conveyor.spider.addToQueue(taskConfig)
      if (!addResult.success) {
        toast.error('添加失败')
        return
      }

      // Start queue (idempotent - safe to call even if already running)
      const startResult = await window.conveyor.spider.startQueue()

      if (startResult.success) {
        toast.success('已开始下载')
        onDownloadStarted?.()
      } else {
        // Queue added but didn't start - might already be running
        toast.success('已加入下载队列')
        onDownloadStarted?.()
      }

    } catch (error) {
      console.error('Failed to start download:', error)
      toast.error('下载失败: ' + error)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <motion.div
      className="space-y-6 pb-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.2 }}
    >
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">下载数据</h1>
        <p className="text-muted-foreground mt-2 text-lg">选择数据源并开始下载</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Input Form */}
        <div className="lg:col-span-2 space-y-6">
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                选择数据源
              </CardTitle>
              <CardDescription>根据不同的数据源选择对应的方式</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={taskType} onValueChange={(v) => setTaskType(v as TaskType)} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-8 bg-secondary/50 p-1">
                  <TabsTrigger
                    value="notes"
                    className="gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all duration-300"
                  >
                    <FileText className="w-4 h-4" />
                    笔记链接
                  </TabsTrigger>
                  <TabsTrigger
                    value="user"
                    className="gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all duration-300"
                  >
                    <User className="w-4 h-4" />
                    博主主页
                  </TabsTrigger>
                  <TabsTrigger
                    value="search"
                    className="gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all duration-300"
                  >
                    <Search className="w-4 h-4" />
                    搜索关键词
                  </TabsTrigger>
                </TabsList>

                <div className="min-h-[300px]">
                  {/* Notes Task */}
                  <TabsContent value="notes" className="space-y-4 mt-0">
                    <div className="space-y-3">
                      <Label className="text-base">笔记链接列表</Label>
                      <Textarea
                        value={noteUrls}
                        onChange={(e) => setNoteUrls(e.target.value)}
                        placeholder="https://www.xiaohongshu.com/explore/xxxxx&#10;每行一个链接"
                        className="min-h-[250px] font-mono text-sm bg-secondary/20 border-border/50 focus:border-primary/50 transition-colors resize-none p-4"
                      />
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                        每行一个 URL，支持批量输入
                      </p>
                    </div>
                  </TabsContent>

                  {/* User Task */}
                  <TabsContent value="user" className="space-y-4 mt-0">
                    <div className="space-y-3">
                      <Label className="text-base">博主主页链接</Label>
                      <div className="relative">
                        <div className="absolute left-3 top-3 text-muted-foreground">
                          <User className="w-4 h-4" />
                        </div>
                        <Input
                          value={userUrl}
                          onChange={(e) => setUserUrl(e.target.value)}
                          placeholder="https://www.xiaohongshu.com/user/profile/xxxxx"
                          className="pl-10 h-12 bg-secondary/20 border-border/50 focus:border-primary/50 transition-colors"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                        将下载该博主的所有公开笔记
                      </p>
                    </div>
                  </TabsContent>

                  {/* Search Task */}
                  <TabsContent value="search" className="space-y-6 mt-0">
                    <div className="space-y-3">
                      <Label className="text-base">搜索关键词</Label>
                      <div className="relative">
                        <div className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
                          <Search className="w-4 h-4" />
                        </div>
                        <Input
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="例如: 榴莲"
                          className="pl-10 h-12 bg-secondary/20 border-border/50 focus:border-primary/50 transition-colors text-lg"
                        />
                      </div>
                    </div>

                    <div className="p-6 rounded-xl bg-secondary/10 border border-border/50 space-y-6">
                      <div className="space-y-4">
                        <div className="flex items-center justify-between">
                          <Label>下载数量</Label>
                          <Badge
                            variant="secondary"
                            className="bg-primary/10 text-primary hover:bg-primary/20 transition-colors px-3 py-1 text-sm"
                          >
                            {searchCount} 条
                          </Badge>
                        </div>
                        <div className="relative pt-2">
                          <input
                            type="range"
                            min="10"
                            max="200"
                            step="10"
                            value={searchCount}
                            onChange={(e) => setSearchCount(parseInt(e.target.value))}
                            className="w-full h-2 rounded-lg appearance-none cursor-pointer accent-primary"
                            style={{
                              background: `linear-gradient(to right, var(--primary) ${((searchCount - 10) / 190) * 100}%, var(--secondary) ${((searchCount - 10) / 190) * 100}%)`,
                            }}
                          />
                          <div className="flex justify-between text-xs text-muted-foreground mt-2 font-mono">
                            <span>10</span>
                            <span>200</span>
                          </div>
                        </div>
                      </div>

                      <Separator className="bg-border/50" />

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground">排序方式</Label>
                          <Select value={sortType} onValueChange={setSortType}>
                            <SelectTrigger className="bg-background/50 border-border/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">综合排序</SelectItem>
                              <SelectItem value="1">最新</SelectItem>
                              <SelectItem value="2">最多点赞</SelectItem>
                              <SelectItem value="3">最多评论</SelectItem>
                              <SelectItem value="4">最多收藏</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground">笔记类型</Label>
                          <Select value={noteType} onValueChange={setNoteType}>
                            <SelectTrigger className="bg-background/50 border-border/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">不限</SelectItem>
                              <SelectItem value="1">视频笔记</SelectItem>
                              <SelectItem value="2">图文笔记</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-2">
                          <Label className="text-xs uppercase tracking-wider text-muted-foreground">时间范围</Label>
                          <Select value={timeRange} onValueChange={setTimeRange}>
                            <SelectTrigger className="bg-background/50 border-border/50">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="0">不限</SelectItem>
                              <SelectItem value="1">一天内</SelectItem>
                              <SelectItem value="2">一周内</SelectItem>
                              <SelectItem value="3">半年内</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </div>
                  </TabsContent>
                </div>
              </Tabs>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Save Options */}
        <div className="space-y-6">
          <Card className="border-border/50 bg-card shadow-xl">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Save className="w-5 h-5 text-primary" />
                <div>
                  <CardTitle>保存选项</CardTitle>
                  <CardDescription>配置数据保存格式</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Save Mode */}
              <div className="space-y-3">
                <Label className="text-xs uppercase tracking-wider text-muted-foreground">保存方式</Label>
                <div className="grid grid-cols-1 gap-2">
                  {[
                    { value: 'excel' as SaveMode, label: '仅 Excel', icon: FileSpreadsheet, desc: '只保存数据表格' },
                    { value: 'media' as SaveMode, label: '仅媒体', icon: Image, desc: '只下载图片/视频' },
                    { value: 'all' as SaveMode, label: '全部保存', icon: Save, desc: '保存数据和媒体文件' },
                  ].map((option) => {
                    const Icon = option.icon
                    const isSelected = saveMode === option.value
                    return (
                      <button
                        key={option.value}
                        onClick={() => setSaveMode(option.value)}
                        className={`
                          relative p-3 rounded-xl border transition-all duration-300 flex items-center gap-3 text-left group
                          ${
                            isSelected
                              ? 'border-primary bg-primary/5 text-primary shadow-[0_0_15px_rgba(var(--primary),0.15)]'
                              : 'border-border/50 hover:border-primary/30 hover:bg-secondary/50'
                          }
                        `}
                      >
                        <div
                          className={`p-2 rounded-lg transition-colors ${isSelected ? 'bg-primary text-white' : 'bg-secondary text-muted-foreground group-hover:text-foreground'}`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="font-medium text-sm">{option.label}</div>
                          <div className="text-[10px] opacity-60">{option.desc}</div>
                        </div>
                        {isSelected && (
                          <motion.div
                            layoutId="saveModeCheck"
                            className="absolute right-3 w-2 h-2 rounded-full bg-primary"
                          />
                        )}
                      </button>
                    )
                  })}
                </div>
              </div>

              <Separator className="bg-border/50" />

              {/* Excel Name */}
              {(saveMode === 'excel' || saveMode === 'all') && (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">Excel 文件名</Label>
                  <Input
                    value={excelName}
                    onChange={(e) => setExcelName(e.target.value)}
                    placeholder={
                      taskType === 'search'
                        ? '留空则使用关键词'
                        : taskType === 'user'
                          ? '留空则使用用户ID'
                          : '例如: 我的收藏'
                    }
                    className="bg-secondary/20 border-border/50 focus:border-primary/50"
                  />
                </div>
              )}

              {/* Media Types */}
              {(saveMode === 'media' || saveMode === 'all') && (
                <div className="space-y-3">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">媒体类型</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <label
                      className={`
                        flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-300
                        ${
                          saveVideo
                            ? 'border-primary/50 bg-primary/5 text-primary'
                            : 'border-border/50 hover:border-primary/30 hover:bg-secondary/50'
                        }
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={saveVideo}
                        onChange={(e) => setSaveVideo(e.target.checked)}
                        className="hidden"
                      />
                      <Video className="w-4 h-4" />
                      <span className="font-medium text-sm">视频</span>
                    </label>
                    <label
                      className={`
                        flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all duration-300
                        ${
                          saveImage
                            ? 'border-primary/50 bg-primary/5 text-primary'
                            : 'border-border/50 hover:border-primary/30 hover:bg-secondary/50'
                        }
                      `}
                    >
                      <input
                        type="checkbox"
                        checked={saveImage}
                        onChange={(e) => setSaveImage(e.target.checked)}
                        className="hidden"
                      />
                      <Image className="w-4 h-4" />
                      <span className="font-medium text-sm">图片</span>
                    </label>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Download Button */}
          <Button
            onClick={handleDownload}
            disabled={isSubmitting}
            size="lg"
            className="w-full h-14 text-base font-medium transition-all duration-300 bg-primary hover:bg-primary/90 shadow-lg hover:shadow-xl hover:scale-[1.02]"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                处理中...
              </>
            ) : (
              <>
                <Download className="w-5 h-5 mr-2" />
                开始下载
              </>
            )}
          </Button>

          {/* Hint */}
          <div className="p-4 rounded-lg bg-blue-500/10 border border-blue-500/20">
            <p className="text-xs text-blue-600 dark:text-blue-400">
              💡 下载会自动排队，可以继续添加更多
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  )
}
