import { useState, useEffect } from 'react'
import { PlayCircle, Pause, Trash2, ListOrdered, CheckCircle, XCircle, Clock, Loader2 } from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { toast } from 'sonner'
import type { QueueItem, QueueStatus } from '../../lib/conveyor/schemas/spider-schema'

export default function QueuePage() {
  const [queueItems, setQueueItems] = useState<QueueItem[]>([])
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Load queue items and status
  const loadQueue = async () => {
    try {
      const [items, status] = await Promise.all([
        window.conveyor.spider.getQueueItems(),
        window.conveyor.spider.getQueueStatus()
      ])
      setQueueItems(items)
      setQueueStatus(status)
    } catch (error) {
      console.error('Failed to load queue:', error)
      toast.error('加载队列失败')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadQueue()

    // Listen to queue status updates
    const unsubscribe = window.conveyor.spider.onQueueStatus((status) => {
      setQueueStatus(status)
      // Reload queue items when status changes
      loadQueue()
    })

    // Refresh every 5 seconds
    const interval = setInterval(loadQueue, 5000)

    return () => {
      unsubscribe()
      clearInterval(interval)
    }
  }, [])

  const handleStartQueue = async () => {
    try {
      const result = await window.conveyor.spider.startQueue()
      if (result.success) {
        toast.success('批量下载已启动')
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('Failed to start queue:', error)
      toast.error('启动失败')
    }
  }

  const handleStopQueue = async () => {
    try {
      const result = await window.conveyor.spider.stopQueue()
      if (result.success) {
        toast.success('批量下载已停止')
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      console.error('Failed to stop queue:', error)
      toast.error('停止失败')
    }
  }

  const handleRemoveItem = async (queueId: number) => {
    try {
      const result = await window.conveyor.spider.removeFromQueue(queueId)
      if (result.success) {
        toast.success('已从列表中移除')
        loadQueue()
      } else {
        toast.error(result.message || '移除失败')
      }
    } catch (error) {
      console.error('Failed to remove item:', error)
      toast.error('移除失败')
    }
  }

  const handleClearCompleted = async () => {
    try {
      const result = await window.conveyor.spider.clearCompletedQueue()
      if (result.success) {
        toast.success('已清理完成项')
        loadQueue()
      } else {
        toast.error('清理失败')
      }
    } catch (error) {
      console.error('Failed to clear completed:', error)
      toast.error('清理失败')
    }
  }

  const getStatusBadge = (status: QueueItem['status']) => {
    const variants: Record<QueueItem['status'], { label: string; color: string; icon: any }> = {
      pending: { label: '待处理', color: 'bg-gray-500', icon: Clock },
      running: { label: '运行中', color: 'bg-blue-500', icon: Loader2 },
      completed: { label: '已完成', color: 'bg-green-500', icon: CheckCircle },
      failed: { label: '失败', color: 'bg-red-500', icon: XCircle }
    }

    const variant = variants[status]
    const Icon = variant.icon

    return (
      <Badge className={`${variant.color} text-white`}>
        <Icon className={`w-3 h-3 mr-1 ${status === 'running' ? 'animate-spin' : ''}`} />
        {variant.label}
      </Badge>
    )
  }

  const getTaskTypeLabel = (taskConfig: string) => {
    try {
      const config = JSON.parse(taskConfig)
      const typeLabels: Record<string, string> = {
        notes: '指定笔记',
        user: '博主笔记',
        search: '搜索结果'
      }
      return typeLabels[config.taskType] || '未知'
    } catch {
      return '未知'
    }
  }

  const getTaskDescription = (taskConfig: string) => {
    try {
      const config = JSON.parse(taskConfig)
      if (config.taskType === 'notes') {
        return `${config.params.notes?.length || 0} 个笔记`
      } else if (config.taskType === 'user') {
        return config.params.userUrl || '用户主页'
      } else if (config.taskType === 'search') {
        return config.params.query || '搜索关键词'
      }
      return '-'
    } catch {
      return '-'
    }
  }

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleString('zh-CN')
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <Loader2 className="w-8 h-8 animate-spin" />
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="p-6 max-w-7xl mx-auto"
    >
      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold mb-2">批量下载</h1>
        <p className="text-muted-foreground">添加多个任务，自动依次下载</p>
      </div>

      {/* Queue Stats Card */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <ListOrdered className="w-5 h-5 mr-2" />
              任务状态
            </span>
            <Badge variant={queueStatus?.status === 'running' ? 'default' : 'secondary'}>
              {queueStatus?.status === 'running' ? '运行中' : queueStatus?.status === 'paused' ? '已暂停' : '空闲'}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-4">
            <div className="text-center">
              <div className="text-2xl font-bold text-gray-500">{queueStatus?.stats.pending || 0}</div>
              <div className="text-sm text-muted-foreground">待处理</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-500">{queueStatus?.stats.running || 0}</div>
              <div className="text-sm text-muted-foreground">运行中</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-green-500">{queueStatus?.stats.completed || 0}</div>
              <div className="text-sm text-muted-foreground">已完成</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold text-red-500">{queueStatus?.stats.failed || 0}</div>
              <div className="text-sm text-muted-foreground">失败</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold">{queueStatus?.stats.total || 0}</div>
              <div className="text-sm text-muted-foreground">总计</div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex flex-wrap gap-2">
            {queueStatus?.status === 'running' ? (
              <Button onClick={handleStopQueue} variant="destructive">
                <Pause className="w-4 h-4 mr-2" />
                停止批量下载
              </Button>
            ) : (
              <Button
                onClick={handleStartQueue}
                disabled={!queueItems.some(item => item.status === 'pending')}
              >
                <PlayCircle className="w-4 h-4 mr-2" />
                开始批量下载
              </Button>
            )}
            <Button
              onClick={handleClearCompleted}
              variant="outline"
              disabled={!queueItems.some(item => item.status === 'completed' || item.status === 'failed')}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              清理已完成
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Queue Items List */}
      <Card>
        <CardHeader>
          <CardTitle>任务列表</CardTitle>
          <CardDescription>
            {queueItems.length > 0 ? `共 ${queueItems.length} 个任务` : '列表为空'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {queueItems.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <ListOrdered className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>列表中暂无任务</p>
              <p className="text-sm mt-2">在"下载"页面点击"添加到列表"按钮</p>
            </div>
          ) : (
            <div className="space-y-3">
              {queueItems.map((item, index) => (
                <motion.div
                  key={item.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.05 }}
                  className="border rounded-lg p-4 hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <Badge variant="outline">{getTaskTypeLabel(item.task_config)}</Badge>
                        {getStatusBadge(item.status)}
                        {item.priority > 0 && (
                          <Badge variant="secondary">优先级: {item.priority}</Badge>
                        )}
                      </div>
                      <div className="text-sm mb-1">
                        <span className="font-medium">描述：</span>
                        {getTaskDescription(item.task_config)}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        创建时间：{formatDate(item.created_at)}
                      </div>
                      {item.started_at && (
                        <div className="text-xs text-muted-foreground">
                          开始时间：{formatDate(item.started_at)}
                        </div>
                      )}
                      {item.completed_at && (
                        <div className="text-xs text-muted-foreground">
                          完成时间：{formatDate(item.completed_at)}
                        </div>
                      )}
                      {item.error_message && (
                        <div className="text-xs text-red-500 mt-1">
                          错误：{item.error_message}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col gap-2 ml-4">
                      {item.status === 'pending' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleRemoveItem(item.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  )
}
