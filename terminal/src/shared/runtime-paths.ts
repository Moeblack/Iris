import os from "node:os"
import { join, resolve } from "node:path"

export function resolveRuntimeDataDir(): string {
  return resolve(process.env.IRIS_DATA_DIR || join(os.homedir(), ".iris"))
}

export function resolveRuntimeConfigDir(): string {
  return join(resolveRuntimeDataDir(), "configs")
}
