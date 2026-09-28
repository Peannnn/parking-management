import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
export const root = fileURLToPath(new URL('../', import.meta.url))
export const python = resolve(root, '.venv', process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
export function requirePython() {
  if (!existsSync(python)) {
    console.error('Python environment missing. Follow the one-time setup in README.md to create .venv and install backend requirements.')
    process.exit(1)
  }
}
