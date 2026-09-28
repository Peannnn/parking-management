import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { recognizePhoto } from '../src/alpr.js'
const photo = new Blob(['test'], { type: 'image/jpeg' })

test('sends photos only to the relative local endpoint and returns detections', async () => {
  const expected = { plates: [{ text: 'ABC123' }] }
  mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(url, '/api/recognize')
    assert.equal(options.method, 'POST')
    assert.equal(options.body, photo)
    return { ok: true, json: async () => expected }
  })
  try { assert.deepEqual(await recognizePhoto(photo, new AbortController().signal), expected) } finally { mock.restoreAll() }
})

test('explains unavailable service, invalid JSON, and no detections', async () => {
  mock.method(globalThis, 'fetch', async () => { throw new TypeError('failed fetch') })
  await assert.rejects(recognizePhoto(photo, new AbortController().signal), /npm run api/)
  mock.restoreAll()
  mock.method(globalThis, 'fetch', async () => ({ ok: false, json: async () => ({ detail: 'Models missing' }) }))
  await assert.rejects(recognizePhoto(photo, new AbortController().signal), /Models missing/)
  mock.restoreAll()
  mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => { throw new Error('invalid JSON') } }))
  await assert.rejects(recognizePhoto(photo, new AbortController().signal), /Unexpected local/)
  mock.restoreAll()
  mock.method(globalThis, 'fetch', async () => ({ ok: true, json: async () => ({ plates: [] }) }))
  assert.deepEqual(await recognizePhoto(photo, new AbortController().signal), { plates: [] })
  mock.restoreAll()
})
