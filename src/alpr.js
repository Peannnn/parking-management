// Relative API requests are proxied exclusively to the loopback Python service.
export async function recognizePhoto(blob, signal) {
  const timeout = AbortSignal.timeout(120_000)
  const combined = AbortSignal.any([signal, timeout])
  try {
    const response = await fetch('/api/recognize', {
      method: 'POST', headers: { 'Content-Type': blob.type }, body: blob, signal: combined,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) throw new Error(data?.detail || 'Local engine unavailable. Run npm run api in a second terminal, then retry recognition.')
    if (!data || !Array.isArray(data.plates)) throw new Error('Unexpected local engine response. Restart npm run api and retry.')
    return data
  } catch (error) {
    if (timeout.aborted) throw new Error('Recognition timed out. Try a smaller photo or restart npm run api.', { cause: error })
    if (error instanceof TypeError) throw new Error('Cannot reach the local engine. Run npm run api in a second terminal, then retry recognition.', { cause: error })
    throw error
  }
}
