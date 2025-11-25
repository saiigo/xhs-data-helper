import { useState } from 'react'
import {
  PlayCircle,
  Loader2,
  FileText,
  User,
  Search,
  Save,
  Settings2,
  Image,
  Video,
  FileSpreadsheet,
  Sparkles,
  ListPlus,
  Activity,
} from 'lucide-react'
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

interface TaskConfigPageProps {
  isRunning: boolean
  currentProgress: { current: number; total: number }
  currentTask: string
}

export default function TaskConfigPage({ isRunning, currentProgress, currentTask }: TaskConfigPageProps) {
  const [taskType, setTaskType] = useState<TaskType>('search')

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

  const handleStartTask = async () => {
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

      const saveOptions = {
        mode: saveMode,
        excelName: excelName || (taskType === 'search' ? searchQuery : '数据'),
        mediaTypes,
      }

      const result = await window.conveyor.spider.startTask({
        cookie: config.cookie,
        taskType,
        params,
        saveOptions,
        paths: config.paths,
        proxy: config.proxy.enabled ? config.proxy.url : undefined,
      })

      if (result.success) {
        toast.success('任务已启动！正在下载中...')
      } else {
        toast.error('启动失败: ' + result.error)
        return
      }
    } catch (error) {
      console.error('Failed to start task:', error)
      toast.error('启动失败: ' + error)
    }
  }

  const handleAddToQueue = async () => {
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

      const result = await window.conveyor.spider.addToQueue(taskConfig)

      if (result.success) {
        toast.success('已添加到列表！切换到"任务列表"页面统一管理')
      } else {
        toast.error('添加失败')
      }
    } catch (error) {
      console.error('Failed to add to queue:', error)
      toast.error('添加失败: ' + error)
    }
  }

  const containerVariants: any = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.05,
      },
    },
  }

  const itemVariants: any = {
    hidden: { y: 10, opacity: 0 },
    visible: {
      y: 0,
      opacity: 1,
      transition: {
        type: 'spring',
        stiffness: 100,
        damping: 15,
        duration: 0.15,
      },
    },
  }

  return (
    <motion.div className="space-y-6 pb-12" variants={containerVariants} initial="hidden" animate="visible">
      {/* Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">任务配置</h1>
        <p className="text-muted-foreground mt-2 text-lg">创建并配置新的数据采集任务</p>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Task Configuration */}
        <motion.div className="lg:col-span-2 space-y-6" variants={itemVariants}>
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                选择任务类型
              </CardTitle>
              <CardDescription>根据不同的数据源选择对应的爬取方式</CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={taskType} onValueChange={(v) => setTaskType(v as TaskType)} className="w-full">
                <TabsList className="grid w-full grid-cols-3 mb-8 bg-secondary/50 p-1">
                  <TabsTrigger
                    value="notes"
                    className="gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all duration-300"
                  >
                    <FileText className="w-4 h-4" />
                    指定笔记
                  </TabsTrigger>
                  <TabsTrigger
                    value="user"
                    className="gap-2 data-[state=active]:bg-background data-[state=active]:text-primary data-[state=active]:shadow-sm transition-all duration-300"
                  >
                    <User className="w-4 h-4" />
                    用户笔记
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
                      <Label className="text-base">笔记 URL 列表</Label>
                      <Textarea
                        value={noteUrls}
                        onChange={(e) => setNoteUrls(e.target.value)}
                        placeholder="https://www.xiaohongshu.com/explore/xxxxx?xsec_token=..."
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
                      <Label className="text-base">用户主页 URL</Label>
                      <div className="relative">
                        <div className="absolute left-3 top-3 text-muted-foreground">
                          <User className="w-4 h-4" />
                        </div>
                        <Input
                          value={userUrl}
                          onChange={(e) => setUserUrl(e.target.value)}
                          placeholder="https://www.xiaohongshu.com/user/profile/xxxxx?xsec_token=..."
                          className="pl-10 h-12 bg-secondary/20 border-border/50 focus:border-primary/50 transition-colors"
                        />
                      </div>
                      <p className="text-xs text-muted-foreground flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary/50" />
                        将爬取该用户的所有公开笔记
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
                          <Label>爬取数量</Label>
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
        </motion.div>

        {/* Right Column: Save Options & Actions */}
        <motion.div className="space-y-6" variants={itemVariants}>
          {/* Progress Card - only shown when running */}
          {isRunning && currentProgress.total > 0 && (
            <Card className="border-primary/50 bg-primary/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Activity className="w-4 h-4 animate-pulse text-primary" />
                  下载中
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    {currentProgress.current} / {currentProgress.total}
                  </span>
                  <span className="font-bold text-primary">
                    {Math.round((currentProgress.current / currentProgress.total) * 100)}%
                  </span>
                </div>
                <div className="h-2 w-full bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary"
                    initial={{ width: 0 }}
                    animate={{
                      width: `${(currentProgress.current / currentProgress.total) * 100}%`,
                    }}
                    transition={{ type: 'spring', stiffness: 50 }}
                  />
                </div>
                {currentTask && (
                  <p className="text-xs text-muted-foreground truncate font-mono">{currentTask}</p>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="border-border/50 bg-card shadow-xl h-fit">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Settings2 className="w-5 h-5 text-primary" />
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

          {/* Action Buttons */}
          <div className="grid grid-cols-2 gap-3">
            {/* Add to Queue Button */}
            <Button
              onClick={handleAddToQueue}
              disabled={isRunning}
              size="lg"
              variant="outline"
              className="h-12 text-base font-medium transition-all duration-300"
            >
              <ListPlus className="w-5 h-5 mr-2" />
              添加到列表
            </Button>

            {/* Start Button */}
            <Button
              onClick={handleStartTask}
              disabled={isRunning}
              size="lg"
              className={`
                h-12 text-base font-medium transition-all duration-300
                ${
                  isRunning
                    ? 'bg-secondary text-muted-foreground cursor-not-allowed'
                    : 'bg-primary hover:bg-primary/90 shadow-sm hover:scale-[1.01]'
                }
              `}
            >
              {isRunning ? (
                <>
                  <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                  下载中...
                </>
              ) : (
                <>
                  <PlayCircle className="w-5 h-5 mr-2" />
                  立即下载
                </>
              )}
            </Button>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
