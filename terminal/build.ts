/**
 * Iris Terminal 构建脚本
 * 当前默认编译 onboard 命令界面为独立二进制
 */
import path from "path"
import { mkdir } from "fs/promises"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
process.chdir(__dirname)

const platforms = [
  { name: "linux-x64", target: "bun-linux-x64" },
  { name: "linux-arm64", target: "bun-linux-arm64" },
  { name: "darwin-arm64", target: "bun-darwin-arm64" },
  { name: "darwin-x64", target: "bun-darwin-x64" },
  { name: "windows-x64", target: "bun-win32-x64" },
] as const

async function build() {
  await mkdir("dist", { recursive: true })

  for (const platform of platforms) {
    const outfile = `dist/iris-onboard-${platform.name}`
    console.log(`\nBuilding for ${platform.name}...`)

    const result = await Bun.build({
      entrypoints: ["./src/index.tsx"],
      compile: {
        outfile,
        target: platform.target as any,
      },
      minify: true,
    })

    if (!result.success) {
      const message = result.logs.map((entry) => entry.message).filter(Boolean).join("\n")
      throw new Error(message || `构建失败: ${outfile}`)
    }

    console.log(`Built ${outfile}`)
  }

  console.log("\nAll terminal builds complete")
}

build().catch((err) => {
  console.error("Build failed:", err)
  process.exit(1)
})
