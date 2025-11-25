#!/usr/bin/env node

const { spawn } = require('child_process')
const path = require('path')
const fs = require('fs')

function getPlatformKey() {
  const platform = process.platform
  const arch = process.arch
  return `${platform}-${arch}`
}

async function installDependencies(platformKey) {
  const pythonDir = path.join(__dirname, '..', 'resources', 'python', platformKey, 'python')
  const pythonBin = process.platform === 'win32'
    ? path.join(pythonDir, 'python.exe')
    : path.join(pythonDir, 'bin', 'python3')

  const requirementsFile = path.join(__dirname, '..', 'python-engine', 'requirements.txt')
  const packagesDir = path.join(__dirname, '..', 'resources', 'python-packages')

  // Check if Python exists
  if (!fs.existsSync(pythonBin)) {
    console.error(`❌ Python not found at ${pythonBin}`)
    console.error(`Please run: node scripts/download-python.js ${platformKey}`)
    process.exit(1)
  }

  // Check if requirements.txt exists
  if (!fs.existsSync(requirementsFile)) {
    console.error(`❌ requirements.txt not found at ${requirementsFile}`)
    process.exit(1)
  }

  // Create packages directory
  if (!fs.existsSync(packagesDir)) {
    fs.mkdirSync(packagesDir, { recursive: true })
  }

  console.log(`Installing Python dependencies for ${platformKey}...`)
  console.log(`Python: ${pythonBin}`)
  console.log(`Requirements: ${requirementsFile}`)
  console.log(`Target: ${packagesDir}`)

  return new Promise((resolve, reject) => {
    const pip = spawn(pythonBin, [
      '-m',
      'pip',
      'install',
      '-r',
      requirementsFile,
      '--target',
      packagesDir,
      '--upgrade',
    ], { stdio: 'inherit' })

    pip.on('close', (code) => {
      if (code === 0) {
        console.log('\n✅ Python dependencies installed successfully')
        resolve()
      } else {
        console.error(`\n❌ pip install failed with exit code ${code}`)
        reject(new Error(`pip install failed with exit code ${code}`))
      }
    })

    pip.on('error', (error) => {
      console.error(`\n❌ Failed to spawn pip: ${error.message}`)
      reject(error)
    })
  })
}

// Main
const targetPlatform = process.argv[2] || getPlatformKey()

console.log(`Target platform: ${targetPlatform}`)
installDependencies(targetPlatform).catch((error) => {
  console.error('Installation failed:', error.message)
  process.exit(1)
})
