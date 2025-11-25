import { z } from 'zod'

// Update status schema
export const updateStatusSchema = z.enum([
  'idle',
  'checking',
  'available',
  'not-available',
  'downloading',
  'downloaded',
  'error',
])

// Progress info schema
export const progressInfoSchema = z.object({
  total: z.number(),
  delta: z.number(),
  transferred: z.number(),
  percent: z.number(),
  bytesPerSecond: z.number(),
})

// Update info schema (simplified from electron-updater)
export const updateInfoSchema = z.object({
  version: z.string(),
  releaseDate: z.string().optional(),
  releaseNotes: z.union([z.string(), z.array(z.unknown())]).optional().nullable(),
})

// Update state schema
export const updateStateSchema = z.object({
  status: updateStatusSchema,
  info: updateInfoSchema.nullable(),
  progress: progressInfoSchema.nullable(),
  error: z.string().nullable(),
})

// IPC schemas for updater
export const updaterIpcSchema = {
  'updater:check': {
    args: z.tuple([]),
    return: updateStateSchema,
  },
  'updater:download': {
    args: z.tuple([]),
    return: z.void(),
  },
  'updater:install': {
    args: z.tuple([]),
    return: z.void(),
  },
  'updater:get-status': {
    args: z.tuple([]),
    return: updateStateSchema,
  },
}
