#!/usr/bin/env node

/**
 * Iris npm postinstall 脚本
 *
 * 在 npm install 完成后自动执行，将当前平台的预编译主程序和 onboard 二进制
 * 硬链接（或复制）到包装器包的 bin/.iris 与 bin/.iris-onboard，供统一入口调用。
 */

import fs from "fs"
import path from "path"
import os from "os"
import { fileURLToPath } from "url"
import { createRequire } from "module"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const require = createRequire(import.meta.url)

function detectPlatformAndArch() {
  const platformMap = { darwin: "darwin", linux: "linux", win32: "windows" }
  const archMap = { x64: "x64", arm64: "arm64", arm: "arm" }

  const platform = platformMap[os.platform()] || os.platform()
  const arch = archMap[os.arch()] || os.arch()
  return { platform, arch }
}

function resolvePackageDir() {
  const { platform, arch } = detectPlatformAndArch()
  const packageName = `irisagent-${platform}-${arch}`
  try {
    const packageJsonPath = require.resolve(`${packageName}/package.json`)
    return {
      packageName,
      packageDir: path.dirname(packageJsonPath),
      platform,
    }
  } catch (error) {
    throw new Error(`Could not find package ${packageName}: ${error.message}`)
  }
}

function resolveBinaryPaths() {
  const { packageName, packageDir, platform } = resolvePackageDir()
  const suffix = platform === "windows" ? ".exe" : ""
  const binaries = {
    main: path.join(packageDir, "bin", `iris${suffix}`),
    onboard: path.join(packageDir, "bin", `iris-onboard${suffix}`),
  }

  for (const [kind, binaryPath] of Object.entries(binaries)) {
    if (!fs.existsSync(binaryPath)) {
      throw new Error(`Binary (${kind}) not found in ${packageName}: ${binaryPath}`)
    }
  }

  return binaries
}

function linkOrCopy(sourcePath, targetPath) {
  if (fs.existsSync(targetPath)) {
    fs.unlinkSync(targetPath)
  }

  try {
    fs.linkSync(sourcePath, targetPath)
  } catch {
    fs.copyFileSync(sourcePath, targetPath)
  }
}

async function main() {
  try {
    if (os.platform() === "win32") {
      console.log("Windows detected: skip cached links, launcher will resolve packaged binaries directly")
      return
    }

    const binaries = resolveBinaryPaths()
    const binDir = path.join(__dirname, "bin")
    if (!fs.existsSync(binDir)) {
      fs.mkdirSync(binDir, { recursive: true })
    }

    const targets = {
      main: path.join(binDir, ".iris"),
      onboard: path.join(binDir, ".iris-onboard"),
    }

    for (const [kind, sourcePath] of Object.entries(binaries)) {
      const targetPath = targets[kind]
      linkOrCopy(sourcePath, targetPath)
      fs.chmodSync(targetPath, 0o755)
      console.log(`Iris ${kind} binary linked: ${targetPath} -> ${sourcePath}`)
    }
  } catch (error) {
    console.error("Failed to setup Iris binaries:", error.message)
    process.exit(0)
  }
}

try {
  main()
} catch (error) {
  console.error("Postinstall script error:", error.message)
  process.exit(0)
}
