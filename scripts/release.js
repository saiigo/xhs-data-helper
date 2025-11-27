#!/usr/bin/env node

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

/**
 * Simple release script for bumping version and creating git tag
 * Usage:
 *   node scripts/release.js        # bump patch (1.0.0 -> 1.0.1)
 *   node scripts/release.js minor  # bump minor (1.0.0 -> 1.1.0)
 *   node scripts/release.js major  # bump major (1.0.0 -> 2.0.0)
 */

function exec(command) {
  console.log(`> ${command}`);
  try {
    return execSync(command, { encoding: 'utf8', stdio: 'inherit' });
  } catch (error) {
    console.error(`Failed to execute: ${command}`);
    process.exit(1);
  }
}

function getCurrentVersion() {
  const packagePath = path.join(__dirname, '..', 'package.json');
  const pkg = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
  return pkg.version;
}

function main() {
  const versionType = process.argv[2] || 'patch';

  if (!['patch', 'minor', 'major'].includes(versionType)) {
    console.error(`Invalid version type: ${versionType}`);
    console.error('Usage: node scripts/release.js [patch|minor|major]');
    process.exit(1);
  }

  const currentVersion = getCurrentVersion();
  console.log(`Current version: ${currentVersion}`);
  console.log(`Bumping ${versionType} version...\n`);

  // Check for uncommitted changes
  try {
    execSync('git diff-index --quiet HEAD --', { encoding: 'utf8' });
  } catch (error) {
    console.error('Error: You have uncommitted changes. Please commit or stash them first.');
    process.exit(1);
  }

  // Bump version and create tag
  exec(`npm version ${versionType} -m "chore: release v%s"`);

  const newVersion = getCurrentVersion();
  console.log(`\n✓ Version bumped to ${newVersion}`);
  console.log(`✓ Git tag v${newVersion} created`);
  console.log(`\nNext steps:`);
  console.log(`  git push origin main --tags`);
}

main();
