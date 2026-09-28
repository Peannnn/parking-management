import { test } from 'node:test'
import assert from 'node:assert/strict'
import { loadHistory, saveHistory } from '../src/scanner.js'

test('handles corrupt and unavailable local storage', () => {
  globalThis.localStorage = { getItem: () => '{bad', setItem: () => { throw new Error('quota') } }
  assert.deepEqual(loadHistory(), [])
  assert.equal(saveHistory([]), false)
  globalThis.localStorage = { getItem: () => 'null' }
  assert.deepEqual(loadHistory(), [])
})
test('preserves old records, persists ALPR records, and excludes malformed history', () => {
  let saved
  globalThis.localStorage = { setItem: (_, data) => { saved = data }, getItem: () => saved }
  const row = { id: 'test', plate: 'ABC 1234', source: 'OCR reviewed', time: '2026-09-28T00:00:00Z' }
  const alpr = { ...row, id: 'alpr', source: 'ALPR reviewed' }
  assert.equal(saveHistory([alpr, row, null, { time: 'invalid' }]), true)
  assert.deepEqual(loadHistory(), [alpr, row])
  saveHistory(Array.from({ length: 110 }, () => row))
  assert.equal(loadHistory().length, 100)
})
