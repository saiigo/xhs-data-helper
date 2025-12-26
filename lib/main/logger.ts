import fs from 'fs'
import path from 'path'
import { app } from 'electron'

let logStream: fs.WriteStream | null = null
let logFilePath: string | null = null

const sanitize = (value: string): string => value.replace(/[:]/g, '-').replace(/\s/g, '_')

const formatArgs = (args: any[]): string =>
  args
    .map((arg) => {
      if (typeof arg === 'string') {
        return arg
      }
      if (arg instanceof Error) {
        return `${arg.name}: ${arg.message}\n${arg.stack ?? ''}`
      }
      try {
        return JSON.stringify(arg)
      } catch (error) {
        return String(arg)
      }
    })
    .join(' ')

const writeLog = (level: string, args: any[]): void => {
  if (!logStream) return
  const timestamp = new Date().toISOString()
  const message = formatArgs(args)
  logStream.write(`[${timestamp}] [${level}] ${message}\n`)
}

export const initLogger = (): void => {
  if (logStream) return

  // Use project-specific logs directory instead of userData
  const projectRoot = process.cwd()
  const logsDir = path.join(projectRoot, 'tmp-logs')
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true })
  }

  logFilePath = path.join(logsDir, `app-${sanitize(new Date().toISOString())}.log`)
  logStream = fs.createWriteStream(logFilePath, { flags: 'a' })

  const patchConsole = <T extends keyof Console>(method: T) => {
    const original = console[method].bind(console)
    console[method] = ((...args: any[]) => {
      writeLog(method.toString().toUpperCase(), args)
      original(...args)
    }) as Console[T]
  }

  patchConsole('log')
  patchConsole('info')
  patchConsole('warn')
  patchConsole('error')

  process.on('uncaughtException', (error) => {
    writeLog('UNCAUGHT_EXCEPTION', [error])
  })

  process.on('unhandledRejection', (reason) => {
    writeLog('UNHANDLED_REJECTION', [reason])
  })
}

export const getLogFilePath = (): string | null => logFilePath
