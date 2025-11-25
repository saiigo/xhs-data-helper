# Spider XHS Desktop - Implementation Summary

## Overview

This is a desktop application for Spider XHS (小红书爬虫), built with Electron + React + TypeScript. The application provides a user-friendly GUI for the Python-based Spider_XHS crawler.

## Architecture

### Technology Stack

- **Frontend**: React 18 + TypeScript + Shadcn UI + Tailwind CSS
- **Backend**: Electron (Main Process)
- **Build Tool**: electron-vite
- **Python Integration**: Child process via JSON Lines protocol
- **IPC**: Conveyor pattern (from template)

### Project Structure

```
spider-xhs-desktop/
├── app/                      # React renderer process
│   ├── pages/               # UI pages
│   │   ├── SettingsPage.tsx    # Cookie/paths/proxy config
│   │   ├── TaskConfigPage.tsx  # Task creation (3 types)
│   │   └── MonitorPage.tsx     # Real-time monitoring
│   └── app.tsx              # Main app with navigation
├── lib/
│   ├── main/                # Electron main process
│   │   └── spider/
│   │       ├── python-bridge.ts    # Python subprocess manager
│   │       └── config-manager.ts   # Config persistence + encryption
│   └── conveyor/            # IPC layer
│       ├── api/             # Renderer-side API
│       ├── handlers/        # Main-process handlers
│       └── schemas/         # Zod type schemas
└── /Users/jan/Documents/code/Spider_XHS/
    └── cli.py               # Python CLI entry point
```

## Key Features

### 1. Settings Page (`app/pages/SettingsPage.tsx`)

- **Cookie Management**: AES-256-CBC encrypted storage
- **Path Configuration**: Separate paths for media and Excel outputs
- **Proxy Settings**: Optional HTTP/HTTPS proxy support
- **Cookie Validation**: Real-time validation with visual feedback

### 2. Task Config Page (`app/pages/TaskConfigPage.tsx`)

Supports 3 task types:
- **Notes Task**: Batch crawl specific note URLs
- **User Task**: Crawl all notes from a user profile
- **Search Task**: Search by keyword with advanced filters
  - Sort options: Comprehensive/Latest/Most Liked/Most Commented/Most Saved
  - Note type filter: All/Video/Image-Text
  - Time range filter: All/1 Day/1 Week/6 Months

Save options:
- Excel only / Media only / Both
- Custom Excel filename
- Media type selection (video/image)

### 3. Monitor Page (`app/pages/MonitorPage.tsx`)

Real-time task monitoring:
- **Live Logs**: Color-coded by level (INFO/WARNING/ERROR)
- **Progress Bar**: Visual progress with percentage
- **Task Control**: Stop button for running tasks
- **Log Management**: Clear and export logs
- **Quick Actions**: Open media/Excel folders directly in file manager

## Implementation Details

### Python Bridge (`lib/main/spider/python-bridge.ts`)

**Responsibility**: Manage Python subprocess lifecycle

Key methods:
- `start(config, onMessage)`: Spawn Python CLI with JSON config
- `stop()`: Terminate running task (SIGTERM)
- `isRunning()`: Check task status

Communication protocol:
- **Input**: JSON string as CLI argument
- **Output**: JSON Lines on stdout (one JSON object per line)
- **Error handling**: stderr + process exit codes

### Config Manager (`lib/main/spider/config-manager.ts`)

**Responsibility**: Persistent configuration with security

Features:
- Cookie encryption (AES-256-CBC with random IV)
- Cookie expiry validation
- Path and proxy persistence
- Last task recovery (optional feature)

Storage location: `~/.spider-xhs-config.json`

### Python CLI (`cli.py`)

**Responsibility**: Bridge between Electron and Spider_XHS

Message types:
```python
{"type": "log", "level": "INFO|WARNING|ERROR", "message": "..."}
{"type": "progress", "current": N, "total": M, "message": "..."}
{"type": "done", "success": true, "message": "...", "count": N}
{"type": "error", "code": "ERROR_CODE", "message": "..."}
```

### IPC Architecture

**Conveyor Pattern** (template-provided abstraction):

1. **Schemas** (`lib/conveyor/schemas/spider-schema.ts`)
   - Zod schemas for runtime validation
   - Type inference for TypeScript

2. **API** (`lib/conveyor/api/spider-api.ts`)
   - Renderer-side API wrapper
   - Methods map to IPC channels

3. **Handlers** (`lib/conveyor/handlers/spider-handler.ts`)
   - Main-process IPC handlers
   - Business logic integration

IPC Channels:
```
spider:config:getAll
spider:config:setCookie
spider:config:isCookieValid
spider:config:setPaths
spider:config:setProxy
spider:start
spider:stop
spider:isRunning
spider:message (one-way: main → renderer)
dialog:selectDirectory
dialog:openFolder
```

## Data Flow

### Task Execution Flow

```
UI (TaskConfigPage)
  → conveyor.spider.startTask(config)
  → IPC: spider:start
  → pythonBridge.start(config, onMessage)
  → spawn("python3 cli.py", [JSON.stringify(config)])
  → Python stdout: JSON Lines
  → onMessage callback
  → IPC: spider:message
  → UI (MonitorPage): handleSpiderMessage()
  → Update logs/progress
```

### Configuration Flow

```
UI (SettingsPage)
  → conveyor.spider.setCookie()
  → IPC: spider:config:setCookie
  → configManager.setCookie()
  → Encrypt with AES-256-CBC
  → Write to ~/.spider-xhs-config.json
```

## Security

### Cookie Protection

- **Encryption**: AES-256-CBC with random IV per encryption
- **Key derivation**: SHA-256 hash of machine ID
- **Storage**: Local JSON file (not accessible from renderer)

### Input Validation

- Zod schemas for runtime type checking
- File path validation before operations
- Cookie expiry validation

## Development

### Running in Development

```bash
pnpm install
pnpm run dev
```

This starts:
1. Vite dev server for renderer (http://localhost:5173)
2. Electron main process with hot reload
3. Auto-restart on main process changes

### File Watching

- **Renderer**: Vite HMR for instant updates
- **Main/Preload**: Auto rebuild + Electron restart

## Testing

### Manual Test Flow

1. **Settings**
   - Paste valid cookie → Save → Verify "Cookie 有效"
   - Select media/Excel directories
   - Enable proxy (optional)

2. **Task Config**
   - Choose task type (search recommended for testing)
   - Enter keyword (e.g., "榴莲")
   - Set count to 10
   - Click "开始爬取"

3. **Monitor**
   - Check for log messages
   - Verify progress bar updates
   - Test stop button
   - Export logs
   - Open result folders

### Python CLI Test

```bash
cd /Users/jan/Documents/code/Spider_XHS
python3 cli.py '{
  "cookie":"test",
  "taskType":"search",
  "params":{"query":"测试","requireNum":1,...},
  "saveOptions":{"mode":"excel","excelName":"测试"},
  "paths":{"media":"/tmp/test","excel":"/tmp/test"}
}'
```

## Known Limitations

1. **Production Bundling**: Python environment not yet packaged
   - Currently uses system Python3
   - Hardcoded path to `~/Documents/code/Spider_XHS/cli.py`
   - TODO: Bundle Python + dependencies with PyInstaller/Nuitka

2. **Platform**: macOS only (tested)
   - Windows/Linux need path adjustments
   - File path separator handling

3. **Error Recovery**: Limited
   - Task crashes leave no recovery mechanism
   - No retry logic for network failures

## Future Enhancements

- [ ] Python environment bundling for production
- [ ] Cross-platform path handling
- [ ] Task queue for multiple tasks
- [ ] Result preview in UI
- [ ] Export formats (JSON, CSV)
- [ ] Scheduled tasks
- [ ] Login integration (QR code)

## File Paths

### Development Paths

- **Python CLI**: `/Users/jan/Documents/code/Spider_XHS/cli.py`
- **Config file**: `~/.spider-xhs-config.json`
- **Default media**: `~/Documents/spider-xhs-media`
- **Default Excel**: `~/Documents/spider-xhs-excel`

### Production Paths (TODO)

```
app.asar/
  resources/
    python/
      cli.py
      main.py
      [all dependencies]
```

## Credits

- **Spider Engine**: Spider_XHS (original Python project)
- **UI Components**: Shadcn UI
- **Icons**: Lucide React

---

**Version**: 1.0.0
**Last Updated**: 2025-11-23
**Status**: ✅ Core features complete, ready for testing
