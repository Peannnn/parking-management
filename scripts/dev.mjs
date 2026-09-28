import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { python, root, requirePython } from './runtime.mjs'
requirePython()
const children = [
  spawn(python, ['-m', 'backend.app'], { cwd: root, stdio: 'inherit', windowsHide: true }),
  spawn(process.execPath, [resolve(root, 'node_modules/vite/bin/vite.js')], { cwd: root, stdio: 'inherit', windowsHide: true }),
]
let stopping = false
function stop(code = 0) {
  if (stopping) return
  stopping = true
  children.forEach(child => child.kill())
  process.exitCode = code
}
children.forEach(child => {
  child.on('error', error => { console.error(error.message); stop(1) })
  child.on('exit', code => { if (!stopping) stop(code ?? 1) })
})
process.on('SIGINT', () => stop())
process.on('SIGTERM', () => stop())
