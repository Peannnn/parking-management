import { spawn } from 'node:child_process'
import { python, root, requirePython } from './runtime.mjs'
requirePython()
const child = spawn(python, ['-m', ...process.argv.slice(2)], { cwd: root, stdio: 'inherit', windowsHide: true })
child.on('error', error => { console.error(error.message); process.exitCode = 1 })
child.on('exit', code => { process.exitCode = code ?? 1 })
process.on('SIGINT', () => child.kill())
process.on('SIGTERM', () => child.kill())
