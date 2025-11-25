import { useState, useEffect } from 'react'
import { Settings, Zap, History, Loader2, RefreshCw, Download as DownloadIcon, CheckCircle2 } from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import SettingsPage from './pages/SettingsPage'
import DownloadPage from './pages/DownloadPage'
import HistoryPage from './pages/HistoryPage'
import { Badge } from './components/ui/badge'
import { Toaster } from './components/ui/sonner'
import { toast } from 'sonner'
import type { UpdateState } from '@/lib/conveyor/api/update-api'
import type { Log, Task } from '@/lib/conveyor/api/spider-api'
import type { PythonMessage } from '@/lib/conveyor/schemas/spider-schema'
import './styles/app.css'

type Page = 'download' | 'history' | 'settings'
type CookieStatus = 'valid' | 'invalid' | 'unknown' | 'checking'

// LogEntry for UI display (formatted timestamp)
interface LogEntry {
  id: string
  type: 'log' | 'progress' | 'done' | 'error'
  level?: 'INFO' | 'WARNING' | 'ERROR'
  message: string
  timestamp: string // formatted as "HH:MM:SS"
}

// Global task state
interface TaskState {
  isRunning: boolean
  logs: LogEntry[]
  progress: { current: number; total: number }
  currentTask: string
}

export default function App() {
  const [currentPage, setCurrentPage] = useState<Page>('download')
  const [cookieStatus, setCookieStatus] = useState<CookieStatus>('checking')
  const [appVersion, setAppVersion] = useState('')
  const [updateState, setUpdateState] = useState<UpdateState>({
    status: 'idle',
    info: null,
    progress: null,
    error: null,
  })

  // Global task state
  const [taskState, setTaskState] = useState<TaskState>({
    isRunning: false,
    logs: [],
    progress: { current: 0, total: 0 },
    currentTask: '',
  })

  // Helper: Convert database Log to LogEntry
  const convertDbLogsToLogEntries = (dbLogs: Log[]): LogEntry[] => {
    return dbLogs.map((log) => ({
      id: String(log.id),
      type: log.type as LogEntry['type'],
      level: log.level as LogEntry['level'],
      message: log.message,
      timestamp: formatTimestamp(log.timestamp),
    }))
  }

  // Helper: Format Unix timestamp to HH:MM:SS
  const formatTimestamp = (timestamp: number): string => {
    const date = new Date(timestamp)
    return date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    })
  }

  // Helper: Convert PythonMessage to LogEntry
  const convertMessageToLogEntry = (message: PythonMessage): LogEntry => {
    return {
      id: String(Date.now()),
      type: message.type as LogEntry['type'],
      level: message.level,
      message: message.message || '',
      timestamp: formatTimestamp(Date.now()),
    }
  }

  // Initialize task state on startup
  const initTaskState = async () => {
    try {
      const running = await window.conveyor.spider.isRunning()
      setTaskState((prev) => ({ ...prev, isRunning: running }))

      if (running) {
        const task = await window.conveyor.spider.getCurrentTask()
        if (task) {
          const dbLogs = await window.conveyor.spider.getTaskLogs(task.id)
          const historyLogs = convertDbLogsToLogEntries(dbLogs)
          setTaskState((prev) => ({ ...prev, logs: historyLogs }))

          // Restore progress from last progress log
          const progressLogs = dbLogs.filter((log) => log.type === 'progress').reverse()
          if (progressLogs.length > 0 && progressLogs[0].metadata) {
            try {
              const meta = JSON.parse(progressLogs[0].metadata)
              setTaskState((prev) => ({
                ...prev,
                progress: {
                  current: meta.current || 0,
                  total: meta.total || 0,
                },
                currentTask: meta.title || '',
              }))
            } catch (error) {
              console.error('Failed to parse progress metadata:', error)
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to initialize task state:', error)
    }
  }

  // Handle spider messages
  const handleSpiderMessage = (message: PythonMessage) => {
    if (message.type === 'log') {
      setTaskState((prev) => ({
        ...prev,
        logs: [...prev.logs, convertMessageToLogEntry(message)],
      }))
    } else if (message.type === 'progress') {
      setTaskState((prev) => ({
        ...prev,
        progress: {
          current: message.current || 0,
          total: message.total || 0,
        },
        currentTask: message.title ? `正在下载: ${message.title}` : message.message || '',
        logs: [...prev.logs, convertMessageToLogEntry(message)],
      }))
    } else if (message.type === 'done') {
      setTaskState((prev) => ({
        ...prev,
        isRunning: false,
        logs: [...prev.logs, convertMessageToLogEntry(message)],
        progress: { current: 0, total: 0 },
        currentTask: '',
      }))
    } else if (message.type === 'error') {
      setTaskState((prev) => ({
        ...prev,
        isRunning: false,
        logs: [...prev.logs, convertMessageToLogEntry(message)],
      }))
    }
  }

  // 应用启动时初始化主题
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') as 'light' | 'dark' | null
    const theme = savedTheme || 'light' // 默认亮色主题
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [])

  // 应用启动时初始化任务状态并订阅消息
  useEffect(() => {
    initTaskState()

    // Subscribe to spider messages
    const unsubscribe = window.conveyor.spider.onMessage((message) => {
      handleSpiderMessage(message)
    })

    return () => unsubscribe()
  }, [])

  // 应用启动时验证 Cookie 和加载更新状态
  useEffect(() => {
    validateCookieOnStartup()
    loadUpdateStatus()

    // Subscribe to update status changes
    const unsubscribeUpdate = window.conveyor.updater.onStatusChange((state) => {
      setUpdateState(state)
      if (state.status === 'available' && state.info) {
        toast.info(`发现新版本 ${state.info.version}`)
      } else if (state.status === 'downloaded') {
        toast.success('更新下载完成，点击安装')
      } else if (state.status === 'error' && state.error) {
        toast.error(`更新失败: ${state.error}`)
      }
    })

    // Subscribe to cookie invalid events from main process
    const unsubscribeCookie = window.conveyor.spider.onCookieInvalid((data: { message: string }) => {
      setCookieStatus('invalid')
      toast.error(data.message || 'Cookie已失效，请重新登录', {
        duration: 5000,
        action: {
          label: '前往设置',
          onClick: () => setCurrentPage('settings')
        }
      })
    })

    return () => {
      unsubscribeUpdate()
      unsubscribeCookie()
    }
  }, [])

  const loadUpdateStatus = async () => {
    try {
      const version = await window.conveyor.app.version()
      setAppVersion(version)
      const state = await window.conveyor.updater.getStatus()
      setUpdateState(state)
    } catch (error) {
      console.error('Failed to load update status:', error)
    }
  }

  const handleUpdateAction = async () => {
    if (updateState.status === 'downloaded') {
      window.conveyor.updater.install()
    } else if (updateState.status === 'available') {
      await window.conveyor.updater.download()
    } else {
      await window.conveyor.updater.check()
    }
  }

  const validateCookieOnStartup = async () => {
    try {
      const config = await window.conveyor.spider.getConfig()
      if (!config.cookie) {
        setCookieStatus('unknown')
        return
      }

      // 真实验证 Cookie
      const result = await window.conveyor.spider.validateCookie(config.cookie)
      setCookieStatus(result.valid ? 'valid' : 'invalid')
    } catch (error) {
      console.error('Failed to validate cookie on startup:', error)
      setCookieStatus('unknown')
    }
  }

  const menuItems = [
    {
      id: 'download' as Page,
      label: '下载',
      icon: DownloadIcon,
      description: '新建下载任务',
    },
    {
      id: 'history' as Page,
      label: '历史',
      icon: History,
      description: '下载状态和记录',
    },
    {
      id: 'settings' as Page,
      label: '设置',
      icon: Settings,
      description: 'Cookie 和配置',
    },
  ]

  const getCookieStatusBadge = () => {
    switch (cookieStatus) {
      case 'checking':
        return (
          <Badge
            variant="outline"
            className="bg-blue-500/10 text-blue-400 border-blue-500/20 px-2 py-0.5 text-[10px] font-medium"
          >
            <Loader2 className="w-3 h-3 mr-1 animate-spin" />
            验证中
          </Badge>
        )
      case 'valid':
        return (
          <Badge
            variant="outline"
            className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 px-2 py-0.5 text-[10px] font-medium"
          >
            已登录
          </Badge>
        )
      case 'invalid':
        return (
          <Badge
            variant="outline"
            className="bg-rose-500/10 text-rose-500 border-rose-500/20 px-2 py-0.5 text-[10px] font-medium"
          >
            已失效
          </Badge>
        )
      default:
        return (
          <Badge
            variant="outline"
            className="bg-zinc-500/10 text-zinc-400 border-zinc-500/20 px-2 py-0.5 text-[10px] font-medium"
          >
            未配置
          </Badge>
        )
    }
  }

  return (
    <div className="flex h-screen bg-background text-foreground overflow-hidden selection:bg-primary/20 selection:text-primary">
      {/* Sidebar */}
      <div className="w-[280px] flex-shrink-0 border-r border-border bg-card flex flex-col relative z-20">
        {/* Header */}
        <div className="p-6 pb-2">
          <div className="flex items-center gap-3 mb-6">
            <div className="relative group">
              <div className="relative w-10 h-10 rounded-xl bg-linear-to-br from-indigo-500 to-blue-600 flex items-center justify-center shadow-[0_8px_16px_-4px_rgba(99,102,241,0.4),inset_0_1px_0_rgba(255,255,255,0.3)] border border-indigo-400/20 transition-all duration-300 group-hover:scale-105 group-hover:-translate-y-0.5 group-hover:shadow-[0_12px_20px_-6px_rgba(99,102,241,0.5),inset_0_1px_0_rgba(255,255,255,0.4)]">
                <Zap className="w-5 h-5 text-white drop-shadow-md" />
              </div>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-foreground">小红书数据助手</h1>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-secondary/50 border border-border/50">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">账号状态</span>
              {getCookieStatusBadge()}
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon
            const isActive = currentPage === item.id
            return (
              <button
                key={item.id}
                onClick={() => setCurrentPage(item.id)}
                className={`
                  group relative w-full flex items-center gap-3 px-3 py-2 rounded-md transition-all duration-200
                  ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
                  }
                `}
              >
                <Icon
                  className={`w-4 h-4 ${isActive ? 'text-primary-foreground' : 'text-muted-foreground group-hover:text-foreground'}`}
                />

                <div className="relative flex-1 text-left">
                  <div className={`text-sm font-medium ${isActive ? 'text-primary-foreground' : 'text-foreground'}`}>
                    {item.label}
                  </div>
                  <div
                    className={`text-[10px] line-clamp-1 ${isActive ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}
                  >
                    {item.description}
                  </div>
                </div>
              </button>
            )
          })}
        </nav>

        {/* Footer */}
        <div className="p-4 border-t border-border bg-muted/10">
          <button
            onClick={handleUpdateAction}
            disabled={updateState.status === 'checking' || updateState.status === 'downloading'}
            className="w-full flex items-center gap-3 p-3 rounded-lg bg-background border border-border hover:bg-muted/50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center border border-border">
              {updateState.status === 'checking' || updateState.status === 'downloading' ? (
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
              ) : updateState.status === 'available' ? (
                <Download className="w-4 h-4 text-primary" />
              ) : updateState.status === 'downloaded' ? (
                <CheckCircle2 className="w-4 h-4 text-green-500" />
              ) : (
                <RefreshCw className="w-4 h-4 text-muted-foreground" />
              )}
            </div>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-medium text-foreground truncate">
                {updateState.status === 'checking'
                  ? '检查中...'
                  : updateState.status === 'available'
                    ? `新版本 v${updateState.info?.version}`
                    : updateState.status === 'downloading'
                      ? `下载中 ${Math.round(updateState.progress?.percent || 0)}%`
                      : updateState.status === 'downloaded'
                        ? '点击安装'
                        : '检查更新'}
              </div>
              <div className="text-[10px] text-muted-foreground truncate">v{appVersion || '1.0.0'}</div>
            </div>
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 relative overflow-hidden flex flex-col bg-background">
        <div className="flex-1 overflow-auto p-8 scroll-smooth">
          <div className="max-w-6xl mx-auto min-h-full flex flex-col justify-center">
            <AnimatePresence mode="wait">
              <motion.div
                key={currentPage}
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -5 }}
                transition={{ duration: 0.15, ease: 'easeOut' }}
                className="min-h-full"
              >
                {currentPage === 'settings' && <SettingsPage onCookieStatusChange={setCookieStatus} />}
                {currentPage === 'download' && <DownloadPage onDownloadStarted={() => setCurrentPage('history')} />}
                {currentPage === 'history' && <HistoryPage />}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
      <Toaster />
    </div>
  )
}
