import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { v4 as uuidv4 } from 'uuid'

interface FeishuConfig {
  appId: string
  appSecret: string
  readInterval: number
  updatedAt: string
  mockEnabled: boolean
}

export class FeishuConfigManager {
  private configPath: string
  private defaultConfig: FeishuConfig = {
    appId: '',
    appSecret: '',
    readInterval: 3,
    updatedAt: new Date().toISOString(),
    mockEnabled: true,
  }

  constructor() {
    const userDataPath = app.getPath('userData')
    this.configPath = path.join(userDataPath, 'feishu-config.json')
    this.ensureConfigFile()
  }

  private ensureConfigFile() {
    console.log('检查配置文件是否存在:', this.configPath)
    try {
      if (!fs.existsSync(this.configPath)) {
        console.log('配置文件不存在，创建默认配置')
        this.saveConfig(this.defaultConfig)
        console.log('默认配置创建成功')
      } else {
        console.log('配置文件已存在')
      }
    } catch (error) {
      console.error('确保配置文件存在时出错:', error)
      throw error
    }
  }

  private saveConfig(config: FeishuConfig) {
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2), 'utf8')
      console.log('配置文件写入成功')
    } catch (error) {
      console.error('配置文件写入失败:', error)
      throw error
    }
  }

  private loadConfig(): FeishuConfig {
    this.ensureConfigFile()
    const configStr = fs.readFileSync(this.configPath, 'utf8')
    const loadedConfig = JSON.parse(configStr)
    // 合并默认配置，确保所有必需字段都存在
    return {
      ...this.defaultConfig,
      ...loadedConfig
    }
  }

  /**
   * 获取飞书API配置
   */
  getConfig(): FeishuConfig {
    return this.loadConfig()
  }

  /**
   * 设置飞书API配置
   */
  setConfig(config: Partial<FeishuConfig>): FeishuConfig {
    console.log('收到飞书配置:', config)
    const currentConfig = this.loadConfig()
    console.log('当前配置:', currentConfig)
    
    // 确保readInterval是数字类型
    if (config.readInterval !== undefined && typeof config.readInterval !== 'number') {
      config.readInterval = parseInt(config.readInterval as any) || this.defaultConfig.readInterval
    }
    
    const newConfig = {
      ...currentConfig,
      ...config,
      updatedAt: new Date().toISOString(),
    }
    console.log('新配置:', newConfig)
    console.log('配置文件路径:', this.configPath)
    this.saveConfig(newConfig)
    console.log('配置保存成功')
    return newConfig
  }
}
