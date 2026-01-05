import { useState, useEffect } from 'react'
import {
  Folder,
  CheckCircle2,
  XCircle,
  Cookie,
  FolderOpen,
  Globe,
  Key,
  Save,
  Info,
  Palette,
  Sun,
  Moon,
  Loader2,
} from 'lucide-react'
import { motion } from 'framer-motion'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card'
import { Input } from '../components/ui/input'
import { Label } from '../components/ui/label'
import { toast } from 'sonner'
import { Textarea } from '../components/ui/textarea'
import { Button } from '../components/ui/button'
import { Alert, AlertDescription } from '../components/ui/alert'
import { Badge } from '../components/ui/badge'
import { Separator } from '../components/ui/separator'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs'

interface SettingsPageProps {
  onCookieStatusChange: (status: 'valid' | 'invalid' | 'unknown' | 'checking') => void
  onStorageModeChange?: (mode: 'feishu' | 'download') => void
}

export default function SettingsPage({ onCookieStatusChange, onStorageModeChange }: SettingsPageProps) {
  const [cookie, setCookie] = useState('')
  const [mediaPath, setMediaPath] = useState('')
  const [excelPath, setExcelPath] = useState('')
  const [proxyEnabled, setProxyEnabled] = useState(false)
  const [proxyUrl, setProxyUrl] = useState('http://127.0.0.1:7890')
  const [isCookieValid, setIsCookieValid] = useState<boolean | null>(null)
  const [saving, setSaving] = useState(false)
  const [validating, setValidating] = useState(false)
  const [loggingIn, setLoggingIn] = useState(false)
  const [userNickname, setUserNickname] = useState<string | null>(null)
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    // 从 localStorage 读取当前主题,默认 light
    return (localStorage.getItem('theme') as 'light' | 'dark') || 'light'
  })

  // 飞书API配置
  const [feishuAppId, setFeishuAppId] = useState('')
  const [feishuAppSecret, setFeishuAppSecret] = useState('')
  const [feishuMockEnabled, setFeishuMockEnabled] = useState(true)
  
  // 数据存储模式
  const [storageMode, setStorageMode] = useState<'feishu' | 'download'>('feishu') // 默认飞书模式
  
  // API请求间隔配置
  const [requestIntervalMin, setRequestIntervalMin] = useState('1')
  const [requestIntervalMax, setRequestIntervalMax] = useState('3')

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    try {
      const config = await window.conveyor.spider.getConfig()
      setCookie(config.cookie || '')
      setMediaPath(config.paths.media)
      setExcelPath(config.paths.excel)
      setProxyEnabled(config.proxy.enabled)
      setProxyUrl(config.proxy.url)
      // 加载请求间隔配置
      setRequestIntervalMin((config.requestInterval?.min || 1).toString())
      setRequestIntervalMax((config.requestInterval?.max || 3).toString())
      // Cookie 状态由 App.tsx 启动时验证，这里不重复验证
      
      // 加载存储模式
      const feishuConfig = await window.conveyor.feishu.getConfig()
      setStorageMode(feishuConfig.storageMode || 'feishu')
      if (onStorageModeChange) {
        onStorageModeChange(feishuConfig.storageMode || 'feishu')
      }
      
      // 加载飞书API配置
      setFeishuAppId(feishuConfig.appId || '')
      setFeishuAppSecret(feishuConfig.appSecret || '')
      setFeishuMockEnabled(feishuConfig.mockEnabled !== undefined ? feishuConfig.mockEnabled : true)
    } catch (error) {
      console.error('Failed to load config:', error)
    }
  }
  
  // 保存存储模式配置
  const handleSaveStorageMode = async (mode: 'feishu' | 'download') => {
    try {
      await window.conveyor.feishu.setConfig({
        storageMode: mode
      })
      console.log('存储模式保存成功:', mode)
      toast.success('存储模式保存成功!')
    } catch (error) {
      console.error('Failed to save storage mode:', error)
      toast.error('存储模式保存失败!')
    }
  }
  
  // 保存飞书API配置
  const handleSaveFeishuConfig = async () => {
    setSaving(true)
    try {
      console.log('=== 开始保存飞书配置 ===')
      console.log('window.conveyor是否存在:', typeof window.conveyor !== 'undefined')
      if (window.conveyor) {
        console.log('window.conveyor对象:', window.conveyor)
        console.log('window.conveyor.feishu是否存在:', typeof window.conveyor.feishu !== 'undefined')
        if (window.conveyor.feishu) {
          console.log('window.conveyor.feishu对象:', window.conveyor.feishu)
          console.log('setConfig方法是否存在:', typeof window.conveyor.feishu.setConfig === 'function')
          
          console.log('准备保存的配置:', {
            appId: feishuAppId,
            appSecret: feishuAppSecret,
            storageMode: storageMode,
            mockEnabled: feishuMockEnabled
          })
          const result = await window.conveyor.feishu.setConfig({
            appId: feishuAppId,
            appSecret: feishuAppSecret,
            storageMode: storageMode,
            mockEnabled: feishuMockEnabled
          })
          console.log('飞书配置保存成功，返回结果:', result)
          toast.success('飞书API配置保存成功!')
        } else {
          console.error('window.conveyor.feishu不存在')
          toast.error('保存失败: 飞书API不可用')
        }
      } else {
        console.error('window.conveyor不存在')
        toast.error('保存失败: Conveyor API不可用')
      }
    } catch (error) {
      console.error('Failed to save feishu config:', error)
      console.error('错误类型:', typeof error)
      console.error('错误详情:', JSON.stringify(error, null, 2))
      console.error('错误堆栈:', error instanceof Error ? error.stack : 'N/A')
      toast.error('保存失败')
    } finally {
      setSaving(false)
      console.log('=== 保存飞书配置结束 ===')
    }
  }
  
  // 保存API请求间隔配置
  const handleSaveRequestInterval = async () => {
    setSaving(true)
    try {
      // 验证请求间隔是否为有效数字
      const min = parseInt(requestIntervalMin)
      const max = parseInt(requestIntervalMax)
      
      if (isNaN(min) || isNaN(max) || min < 1 || max > 60 || min > max) {
        toast.error('请求间隔范围必须是1-60之间的有效数字，且最小值不大于最大值')
        return
      }
      
      await window.conveyor.spider.setRequestInterval({ min, max })
      toast.success('API请求间隔配置保存成功!')
    } catch (error) {
      console.error('Failed to save request interval:', error)
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveCookie = async () => {
    if (!cookie.trim()) return

    setValidating(true)
    setSaving(false)

    try {
      // 先验证 Cookie 真实有效性
      const result = await window.conveyor.spider.validateCookie(cookie)

      if (result.valid) {
        // 验证通过，保存 Cookie
        setSaving(true)
        const validUntil = Date.now() + 30 * 24 * 60 * 60 * 1000
        await window.conveyor.spider.setCookie(cookie, validUntil)
        setIsCookieValid(true)
        setUserNickname(result.userInfo?.nickname || null)
        onCookieStatusChange('valid')
        toast.success('Cookie 验证成功')
      } else {
        // 验证失败
        setIsCookieValid(false)
        setUserNickname(null)
        onCookieStatusChange('invalid')
        toast.error(`Cookie 验证失败: ${result.message}`)
      }
    } catch (error) {
      console.error('Failed to validate cookie:', error)
      setIsCookieValid(false)
      setUserNickname(null)
      onCookieStatusChange('invalid')
      toast.error('验证失败')
    } finally {
      setValidating(false)
      setSaving(false)
    }
  }

  const handleWebViewLogin = async () => {
    setLoggingIn(true)
    try {
      const result = await window.conveyor.spider.webviewLogin()
      if (result.success && result.cookie) {
        setCookie(result.cookie)
        toast.success('登录成功！正在验证...')
        // 自动触发验证流程
        setValidating(true)
        const validationResult = await window.conveyor.spider.validateCookie(result.cookie)

        if (validationResult.valid) {
          setSaving(true)
          const validUntil = Date.now() + 30 * 24 * 60 * 60 * 1000
          await window.conveyor.spider.setCookie(result.cookie, validUntil)
          setIsCookieValid(true)
          setUserNickname(validationResult.userInfo?.nickname || null)
          onCookieStatusChange('valid')
          toast.success('Cookie 验证成功')
        } else {
          setIsCookieValid(false)
          setUserNickname(null)
          onCookieStatusChange('invalid')
          toast.error(`Cookie 验证失败: ${validationResult.message}`)
        }
      } else {
        toast.error(result.error || '登录失败')
      }
    } catch (error) {
      console.error('WebView login failed:', error)
      toast.error('登录失败，请重试')
    } finally {
      setLoggingIn(false)
      setValidating(false)
      setSaving(false)
    }
  }

  const handleSelectDirectory = async (type: 'media' | 'excel') => {
    try {
      const path = await window.conveyor.spider.selectDirectory()
      if (path) {
        if (type === 'media') {
          setMediaPath(path)
        } else {
          setExcelPath(path)
        }
      }
    } catch (error) {
      console.error('Failed to select directory:', error)
    }
  }

  const handleSavePaths = async () => {
    setSaving(true)
    try {
      await window.conveyor.spider.setPaths({ media: mediaPath, excel: excelPath })
      toast.success('路径保存成功!')
    } catch (error) {
      console.error('Failed to save paths:', error)
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveProxy = async () => {
    setSaving(true)
    try {
      await window.conveyor.spider.setProxy({ enabled: proxyEnabled, url: proxyUrl })
      toast.success('代理设置保存成功!')
    } catch (error) {
      console.error('Failed to save proxy:', error)
      toast.error('保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleThemeChange = (newTheme: 'light' | 'dark') => {
    setTheme(newTheme)
    localStorage.setItem('theme', newTheme)
    document.documentElement.classList.toggle('dark', newTheme === 'dark')
  }

  const handleLogout = async () => {
    try {
      // 清除Cookie
      await window.conveyor.spider.setCookie('', 0)
      // 重置所有与登录相关的状态
      setCookie('')
      setIsCookieValid(null)
      setUserNickname(null)
      onCookieStatusChange('unknown')
      toast.success('已退出登录')
    } catch (error) {
      console.error('Failed to logout:', error)
      toast.error('退出登录失败')
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
      {/* Page Header */}
      <motion.div variants={itemVariants}>
        <h1 className="text-3xl font-bold tracking-tight text-foreground">设置</h1>
        <p className="text-muted-foreground mt-2 text-lg">配置 Cookie、保存路径、代理和飞书API</p>
      </motion.div>

      <div className="grid grid-cols-1 gap-6">
        {/* Cookie Configuration */}
        <motion.div variants={itemVariants}>
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Cookie className="w-5 h-5 text-primary" />
                </div>
                <div className="flex-1">
                  <CardTitle>账号登录</CardTitle>
                  <CardDescription>管理你的小红书账号授权</CardDescription>
                </div>
                {isCookieValid !== null && (
                  <Badge variant={isCookieValid ? 'default' : 'destructive'} className="gap-1.5">
                    {isCookieValid ? (
                      <>
                        <CheckCircle2 className="w-3 h-3" />
                        {userNickname ? `${userNickname}` : '已登录'}
                      </>
                    ) : (
                      <>
                        <XCircle className="w-3 h-3" />
                        未登录
                      </>
                    )}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              <Tabs defaultValue="manual" className="w-full">
                <TabsList className="grid w-full grid-cols-2 mb-6">
                  <TabsTrigger value="auto">一键登录</TabsTrigger>
                  <TabsTrigger value="manual">手动 Cookie (推荐)</TabsTrigger>
                </TabsList>

                <TabsContent value="auto" className="space-y-4">
                  <div className="flex flex-col items-center justify-center py-8 text-center space-y-4 border-2 border-dashed border-border rounded-lg bg-secondary/5">
                    <div className="p-4 rounded-full bg-primary/10">
                      <Globe className="w-8 h-8 text-primary" />
                    </div>
                    <div className="space-y-2 max-w-sm">
                      <h3 className="font-medium text-lg">浏览器一键登录</h3>
                      <p className="text-sm text-muted-foreground">
                        点击下方按钮将打开内置浏览器，登录成功后自动同步状态。无需手动复制 Cookie，简单快捷。
                      </p>
                    </div>
                    <Button
                      onClick={handleWebViewLogin}
                      disabled={saving || validating || loggingIn}
                      size="lg"
                      className="min-w-[200px] mt-4"
                    >
                      {loggingIn ? (
                        <>
                          <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                          正在登录...
                        </>
                      ) : (
                        <>
                          <Globe className="w-5 h-5 mr-2" />
                          开始一键登录
                        </>
                      )}
                    </Button>
                  </div>
                </TabsContent>

                <TabsContent value="manual" className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="cookie">Cookie 内容</Label>
                    <Textarea
                      id="cookie"
                      value={cookie}
                      onChange={(e) => setCookie(e.target.value)}
                      placeholder="webId=xxx; a1=xxx; webBuild=xxx..."
                      className="font-mono text-sm min-h-[120px] bg-secondary/20 border-border focus:border-primary/50"
                    />
                  </div>

                  <Alert className="bg-secondary/20 border-border">
                    <Info className="h-4 w-4 text-primary" />
                    <AlertDescription className="text-xs space-y-1 text-muted-foreground">
                      <p className="font-medium text-foreground">💡 如何获取 Cookie:</p>
                      <ol className="list-decimal list-inside space-y-1 ml-2 opacity-80">
                        <li>访问 https://www.xiaohongshu.com 并登录</li>
                        <li>按 F12 打开开发者工具，切换到 Network 标签</li>
                        <li>刷新页面，找到任意请求</li>
                        <li>在请求头中找到 Cookie，复制完整的值</li>
                      </ol>
                    </AlertDescription>
                  </Alert>

                  <Button
                    onClick={handleSaveCookie}
                    disabled={saving || validating || loggingIn || !cookie}
                    className="w-full bg-primary hover:bg-primary/90"
                  >
                    {validating ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        验证中...
                      </>
                    ) : saving ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        保存中...
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4 mr-2" />
                        验证并保存 Cookie
                      </>
                    )}
                  </Button>
                </TabsContent>
              </Tabs>

              {/* 退出登录按钮 - 当有Cookie字符串时显示 */}
              {/* {cookie && cookie.trim() !== '' && (
                <div className="mt-4">
                  <Button
                    onClick={handleLogout}
                    variant="destructive"
                    size="sm"
                    className="w-full"
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    退出登录
                  </Button>
                </div>
              )} */}
            </CardContent>
          </Card>
        </motion.div>

        {/* 数据存储模式 */}
        <motion.div variants={itemVariants}>
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <Save className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <CardTitle>数据存储模式</CardTitle>
                  <CardDescription>配置数据的保存方式</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-secondary/10">
                <div className="flex items-center gap-3">
                  <Save className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">存储模式</p>
                    <p className="text-xs text-muted-foreground">选择数据的保存方式</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={async () => {
                      console.log('切换到飞书模式');
                      setStorageMode('feishu');
                      if (onStorageModeChange) {
                        onStorageModeChange('feishu');
                      }
                      // 保存存储模式
                      await handleSaveStorageMode('feishu');
                    }}
                    className={`
                      px-4 py-2 rounded-full text-sm font-medium transition-all
                      ${storageMode === 'feishu' 
                        ? 'bg-primary text-white' 
                        : 'bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground'}
                    `}
                  >
                    飞书
                  </button>
                  <button
                    onClick={async () => {
                      console.log('切换到下载模式');
                      setStorageMode('download');
                      if (onStorageModeChange) {
                        onStorageModeChange('download');
                      }
                      // 保存存储模式
                      await handleSaveStorageMode('download');
                    }}
                    className={`
                      px-4 py-2 rounded-full text-sm font-medium transition-all
                      ${storageMode === 'download' 
                        ? 'bg-primary text-white' 
                        : 'bg-secondary hover:bg-secondary/80 text-muted-foreground hover:text-foreground'}
                    `}
                  >
                    下载
                  </button>
                </div>
              </div>
              
              {/* 调试信息 */}
              <div className="text-xs text-muted-foreground">
                当前存储模式: {storageMode}
              </div>
              
              <p className="text-xs text-muted-foreground">
                {storageMode === 'feishu' 
                  ? '数据将保存到飞书多维表格' 
                  : '数据将下载到本地文件系统'}
              </p>
            </CardContent>
          </Card>
        </motion.div>
        
        {/* 保存路径配置 - 仅在下载模式下显示 */}
        {storageMode === 'download' && (
          <div>
            <Card className="border-border bg-card shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center">
                    <FolderOpen className="w-5 h-5 text-orange-600" />
                  </div>
                  <div>
                    <CardTitle>保存路径</CardTitle>
                    <CardDescription>配置媒体文件和 Excel 数据的保存位置</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="mediaPath">媒体文件保存路径</Label>
                  <div className="flex gap-2">
                    <Input
                      id="mediaPath"
                      value={mediaPath}
                      onChange={(e) => setMediaPath(e.target.value)}
                      placeholder="/path/to/media"
                      className="flex-1 bg-secondary/20 border-border focus:border-primary/50"
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleSelectDirectory('media')}
                      className="shrink-0 hover:bg-secondary/80"
                    >
                      <Folder className="w-4 h-4 mr-2" />
                      浏览
                    </Button>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="excelPath">Excel 文件保存路径</Label>
                  <div className="flex gap-2">
                    <Input
                      id="excelPath"
                      value={excelPath}
                      onChange={(e) => setExcelPath(e.target.value)}
                      placeholder="/path/to/excel"
                      className="flex-1 bg-secondary/20 border-border focus:border-primary/50"
                    />
                    <Button
                      variant="outline"
                      onClick={() => handleSelectDirectory('excel')}
                      className="shrink-0 hover:bg-secondary/80"
                    >
                      <Folder className="w-4 h-4 mr-2" />
                      浏览
                    </Button>
                  </div>
                </div>

                <Separator className="bg-border" />

                <Button onClick={handleSavePaths} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? '保存中...' : '保存路径配置'}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* 飞书API配置 - 仅在飞书模式下显示 */}
        {storageMode === 'feishu' && (
          <div>
            <Card className="border-border bg-card shadow-sm">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
                    <Globe className="w-5 h-5 text-green-600" />
                  </div>
                  <div>
                    <CardTitle>飞书API配置</CardTitle>
                    <CardDescription>配置飞书开放平台API密钥和读取设置</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="feishuAppId">飞书App ID</Label>
                  <Input
                    id="feishuAppId"
                    placeholder="cli_slkdjoiwjeoiwj"
                    value={feishuAppId}
                    onChange={(e) => setFeishuAppId(e.target.value)}
                    className="bg-secondary/20 border-border focus:border-primary/50"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="feishuAppSecret">飞书App Secret</Label>
                  <Input
                    id="feishuAppSecret"
                    type="password"
                    placeholder="xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
                    value={feishuAppSecret}
                    onChange={(e) => setFeishuAppSecret(e.target.value)}
                    className="bg-secondary/20 border-border focus:border-primary/50"
                  />
                </div>
                

                
                {/* <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-secondary/10">
                  <div className="flex items-center gap-3">
                    <Key className="w-5 h-5 text-muted-foreground" />
                    <div>
                      <p className="font-medium text-sm">启用Mock数据</p>
                      <p className="text-xs text-muted-foreground">使用模拟数据而不是真实请求飞书API</p>
                    </div>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={feishuMockEnabled}
                      onChange={(e) => setFeishuMockEnabled(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-secondary peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                  </label>
                </div> */}
                
                <Alert className="bg-secondary/20 border-border">
                  <Info className="h-4 w-4 text-primary" />
                  <AlertDescription className="text-xs text-muted-foreground">
                    <p className="font-medium text-foreground">💡 如何获取飞书API密钥:</p>
                    <ol className="list-decimal list-inside space-y-1 ml-2 opacity-80">
                      <li>访问 <a href="https://open.feishu.cn" target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">飞书开放平台</a></li>
                      <li>创建企业自建应用</li>
                      <li>在应用管理中获取App ID和App Secret</li>
                      <li>为应用添加"文档阅读"等相关权限</li>
                    </ol>
                  </AlertDescription>
                </Alert>
                
                <Button onClick={handleSaveFeishuConfig} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? '保存中...' : '保存飞书API配置'}
                </Button>
              </CardContent>
            </Card>
          </div>
        )}
        
        {/* Proxy Configuration */}
        <motion.div variants={itemVariants}>
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
                  <Globe className="w-5 h-5 text-blue-600" />
                </div>
                <div>
                  <CardTitle>代理</CardTitle>
                  <CardDescription>可选配置</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex items-center justify-between p-4 border border-border rounded-lg bg-secondary/10">
                <div className="flex items-center gap-3">
                  <Key className="w-5 h-5 text-muted-foreground" />
                  <div>
                    <p className="font-medium text-sm">启用代理</p>
                    <p className="text-xs text-muted-foreground">通过代理服务器下载</p>
                  </div>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={proxyEnabled}
                    onChange={(e) => setProxyEnabled(e.target.checked)}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-secondary peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary/20 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
                </label>
              </div>

              {proxyEnabled && (
                <div className="space-y-2">
                  <Label htmlFor="proxyUrl">代理地址</Label>
                  <Input
                    id="proxyUrl"
                    type="url"
                    value={proxyUrl}
                    onChange={(e) => setProxyUrl(e.target.value)}
                    placeholder="http://127.0.0.1:7890"
                    className="bg-secondary/20 border-border focus:border-primary/50"
                  />
                  <p className="text-xs text-muted-foreground">支持 HTTP 和 HTTPS 代理，格式: http://host:port</p>
                </div>
              )}

              <Separator className="bg-border" />

              <Button onClick={handleSaveProxy} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
                <Save className="w-4 h-4 mr-2" />
                {saving ? '保存中...' : '保存代理设置'}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* API Request Interval Configuration */}
        <motion.div variants={itemVariants}>
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <Loader2 className="w-5 h-5 text-cyan-600" />
                </div>
                <div>
                  <CardTitle>API请求间隔</CardTitle>
                  <CardDescription>配置小红书接口请求的时间间隔，用于反爬</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="requestIntervalMin">最小间隔(秒)</Label>
                  <Input
                    id="requestIntervalMin"
                    type="number"
                    placeholder="1"
                    min="1"
                    max="60"
                    value={requestIntervalMin}
                    onChange={(e) => setRequestIntervalMin(e.target.value)}
                    className="bg-secondary/20 border-border focus:border-primary/50"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="requestIntervalMax">最大间隔(秒)</Label>
                  <Input
                    id="requestIntervalMax"
                    type="number"
                    placeholder="3"
                    min="1"
                    max="60"
                    value={requestIntervalMax}
                    onChange={(e) => setRequestIntervalMax(e.target.value)}
                    className="bg-secondary/20 border-border focus:border-primary/50"
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                每次请求将在配置的时间范围内随机选择间隔，用于避免反爬机制，范围1-60秒
              </p>

              <Separator className="bg-border" />

              <Button onClick={handleSaveRequestInterval} disabled={saving} className="w-full bg-primary hover:bg-primary/90">
                <Save className="w-4 h-4 mr-2" />
                {saving ? '保存中...' : '保存请求间隔配置'}
              </Button>
            </CardContent>
          </Card>
        </motion.div>

        {/* Theme Configuration */}
        <motion.div variants={itemVariants}>
          <Card className="border-border bg-card shadow-sm">
            <CardHeader>
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Palette className="w-5 h-5 text-primary" />
                </div>
                <div>
                  <CardTitle>外观设置</CardTitle>
                  <CardDescription>选择应用的显示主题</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <Label>主题模式</Label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => handleThemeChange('light')}
                    className={`
                      p-4 rounded-lg border-2 transition-all flex items-center gap-3
                      ${
                        theme === 'light'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                      }
                    `}
                  >
                    <Sun className="w-5 h-5" />
                    <div className="text-left">
                      <div className="font-medium">亮色模式</div>
                      <div className="text-xs opacity-60">适合白天使用</div>
                    </div>
                  </button>
                  <button
                    onClick={() => handleThemeChange('dark')}
                    className={`
                      p-4 rounded-lg border-2 transition-all flex items-center gap-3
                      ${
                        theme === 'dark'
                          ? 'border-primary bg-primary/5 text-primary'
                          : 'border-border hover:border-primary/50 hover:bg-secondary/50'
                      }
                    `}
                  >
                    <Moon className="w-5 h-5" />
                    <div className="text-left">
                      <div className="font-medium">暗色模式</div>
                      <div className="text-xs opacity-60">适合夜间使用</div>
                    </div>
                  </button>
                </div>
                <p className="text-xs text-muted-foreground">主题设置会自动保存，下次打开应用时生效</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  )
}
