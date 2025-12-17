import { FeishuHandler } from '@/lib/main/feishu/feishu-handler'

// 全局飞书处理器实例
let feishuHandler: FeishuHandler | null = null

/**
 * 注册飞书相关的IPC事件处理器
 */
export function registerFeishuHandlers() {
  // 确保只初始化一次
  if (!feishuHandler) {
    feishuHandler = new FeishuHandler()
    console.log('飞书处理器已初始化')
  }
  return feishuHandler
}
