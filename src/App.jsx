import { useEffect, useRef, useState } from 'react'
import { supabase } from '../utils/supabase'
import { loadHistory, saveHistory } from './scanner'
import { recognizePhoto } from './alpr'
import './App.css'

export default function App() {
  const [image, setImage] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState('')
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [plate, setPlate] = useState('')
  const [result, setResult] = useState(null)
  const [selected, setSelected] = useState(0)
  const [history, setHistory] = useState(loadHistory)
  const [service, setService] = useState('Checking local engine…')
  const [todos, setTodos] = useState([])
  const [todoStatus, setTodoStatus] = useState(supabase ? 'Loading…' : 'Supabase is not configured.')
  const activeRequest = useRef(null)
  const mounted = useRef(false)
  const previewUrl = useRef(null)
  const chosen = result?.plates[selected]

  useEffect(() => {
    mounted.current = true
    const health = new AbortController()
    fetch('/api/health', { signal: health.signal })
      .then(response => response.json())
      .then(data => { if (mounted.current) setService(data.ready ? 'Local ALPR ready' : 'Local engine needs setup') })
      .catch(() => { if (mounted.current) setService('Start local engine: npm run api') })
    return () => {
      mounted.current = false
      health.abort()
      activeRequest.current?.abort()
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
    }
  }, [])

  useEffect(() => {
    if (!supabase) return
    let active = true
    supabase.from('todos').select('id,name').then(({ data, error }) => {
      if (!active) return
      setTodos(data || [])
      setTodoStatus(error ? 'Could not load existing todos. Check Supabase configuration and read permissions.' : '')
    }).catch(() => { if (active) setTodoStatus('Could not reach Supabase.') })
    return () => { active = false }
  }, [])

  async function scan(photo) {
    const controller = new AbortController()
    activeRequest.current?.abort()
    activeRequest.current = controller
    setResult(null)
    setSelected(0)
    setPlate('')
    setError('')
    setNotice('')
    setBusy(true)
    setProgress('Finding and reading plates on your device…')
    try {
      const data = await recognizePhoto(photo.blob, controller.signal)
      if (!mounted.current || controller.signal.aborted) return
      setResult(data)
      setPlate(data.plates[0]?.text || '')
      setService('Local ALPR ready')
      if (!data.plates.length) {
        setNotice('No license plate detected. Try a closer, clearer vehicle photo, or enter the plate manually.')
      } else if (!data.plates[0].text) {
        setNotice('A plate was located but could not be read. Enter its characters manually or try a clearer photo.')
      }
    } catch (error) {
      if (mounted.current && !controller.signal.aborted) setError(error.message)
    } finally {
      if (activeRequest.current === controller) {
        activeRequest.current = null
        if (mounted.current) setBusy(false)
      }
    }
  }

  async function upload(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || busy) return
    setError('')
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
      setError('Choose a JPG, PNG, or WebP image smaller than 15 MB.')
      return
    }
    setBusy(true)
    setProgress('Opening photo…')
    let bitmap
    try {
      bitmap = await createImageBitmap(file)
      if (bitmap.width * bitmap.height > 24_000_000) throw new Error('Photo exceeds 24 megapixels. Resize it before uploading.')
      const scale = Math.min(1, 3000 / Math.max(bitmap.width, bitmap.height))
      const canvas = document.createElement('canvas')
      canvas.width = Math.round(bitmap.width * scale)
      canvas.height = Math.round(bitmap.height * scale)
      const context = canvas.getContext('2d')
      context.fillStyle = '#fff'
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
      // Normalize orientation and remove metadata. Preview and inference use identical pixels.
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .95))
      if (!blob) throw new Error('Could not prepare this photo. Try another image.')
      if (!mounted.current) return
      if (previewUrl.current) URL.revokeObjectURL(previewUrl.current)
      const src = URL.createObjectURL(blob)
      previewUrl.current = src
      const photo = { src, blob, name: file.name }
      setImage(photo)
      await scan(photo)
    } catch (error) {
      if (mounted.current) setError(error.message || 'Could not open this photo. Try another image.')
    } finally {
      bitmap?.close()
      if (mounted.current) setBusy(false)
    }
  }

  function choosePlate(index) {
    setSelected(index)
    setPlate(result.plates[index].text)
    setNotice('')
    setError('')
  }

  function save(event) {
    event.preventDefault()
    const normalized = plate.trim().toUpperCase().replace(/\s+/g, ' ')
    if (!/^[A-Z0-9][A-Z0-9 -]{0,13}[A-Z0-9]$/.test(normalized)) {
      setError('Enter 2–15 characters using letters, numbers, spaces, or hyphens.')
      return
    }
    const next = [{ id: crypto.randomUUID(), plate: normalized, time: new Date().toISOString(), source: chosen?.text ? 'ALPR reviewed' : 'Manual entry' }, ...history].slice(0, 100)
    if (!saveHistory(next)) { setError('Browser storage is unavailable or full. The record was not saved.'); return }
    setHistory(next)
    setError('')
    setNotice(`${normalized} saved to this browser.`)
    setPlate('')
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="#"><span className="brand-icon">P</span>Smart<span className="brand-light">Park</span></a>
        <span className="workspace-label">SMART PARKING SYSTEM</span>
        <span className="device-badge"><i /> Local processing</span>
      </header>
      <main>
        <div className="page-heading">
          <div><p className="eyebrow">SMART PARKING</p><h1>Automatic plate recognition<span>.</span></h1><p>Upload a vehicle photo. We’ll find and read the plates for you.</p></div>
          <span className="step-pill">ON-DEVICE ALPR</span>
        </div>
        <div className="scanner-grid">
          <section className="panel capture-panel" aria-labelledby="capture-title">
            <div className="panel-heading"><h2 id="capture-title"><span className="step-number">01</span> Upload vehicle photo</h2><span className="small-label">JPG · PNG · WEBP</span></div>
            <div className="capture-body">
              {image ? <div className="image-area automatic-preview" aria-busy={busy}>
                <img src={image.src} alt="Uploaded vehicle with detected license plates highlighted" draggable="false" />
                {result?.plates.map((item, index) => <button
                  key={index} type="button" className={`detection-box ${selected === index ? 'selected' : ''}`}
                  style={{ left: `${item.box.x * 100}%`, top: `${item.box.y * 100}%`, width: `${item.box.w * 100}%`, height: `${item.box.h * 100}%` }}
                  aria-label={`Select plate ${index + 1}: ${item.text || 'unreadable'}`} aria-pressed={selected === index}
                  onClick={() => choosePlate(index)}><span>{index + 1} · {item.text || 'Unreadable'}</span></button>)}
                {busy && <div className="scanning-overlay">Finding plates…</div>}
              </div> : <div className="empty-capture">
                <div className="plate-illustration"><span /><strong>ABC 1234</strong><span /></div>
                <h3>The whole vehicle. Just one photo.</h3>
                <p>We automatically locate plates and read their characters.<br />No manual cropping required.</p>
                <span className="image-limit">Up to 15 MB · 24 megapixels</span>
              </div>}
              {image && <div className="image-caption"><span>{image.name}</span><span>{result ? `${result.plates.length} plate(s) detected · ${(result.elapsedMs / 1000).toFixed(1)}s` : 'Automatic detection'}</span></div>}
              <div className="capture-actions">
                <label className={`button secondary ${busy ? 'disabled' : ''}`}>↑ {image ? 'Choose another photo' : 'Upload & recognize'}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={upload} /></label>
                {image && <button className="button secondary" disabled={busy} onClick={() => scan(image)}>Retry recognition</button>}
              </div>
              <div className="engine-status" role="status">{busy ? progress : service}</div>
              <p className="privacy-note">Photos stay on this computer. Detection and recognition run in your local engine.</p>
            </div>
          </section>
          <section className="panel review-panel" aria-labelledby="review-title">
            <div className="panel-heading"><h2 id="review-title"><span className="step-number">02</span> Review & save</h2></div>
            <div className="review-body">
              <div className="review-status"><span className={chosen ? 'status-dot ready' : 'status-dot'} />{chosen ? 'Plate detected automatically' : result ? 'No plates detected' : 'Ready when you are'}</div>
              <p className="review-description">Review the detected plate before saving. If a photo contains multiple plates, select one below.</p>
              {result?.plates.length > 0 && <div className="plate-choices" aria-label="Detected plates">
                {result.plates.map((item, index) => <button key={index} type="button" aria-pressed={selected === index} onClick={() => choosePlate(index)}><span>Plate {index + 1}</span><strong>{item.text || 'Unreadable'}</strong></button>)}
              </div>}
              <form onSubmit={save}>
                <label className="field-label" htmlFor="plate">LICENSE PLATE</label>
                <input id="plate" className="plate-input" placeholder="ABC 1234" value={plate} maxLength={15} disabled={busy} autoComplete="off" spellCheck="false" onChange={event => { setPlate(event.target.value.toUpperCase()); setNotice('') }} />
                {chosen && <><div className="recognition-details"><span>Plate detection confidence</span><strong>{Math.round(chosen.detectionConfidence * 100)}%</strong></div><div className="recognition-details"><span>Character recognition confidence</span><strong>{Math.round(chosen.recognitionConfidence * 100)}%</strong></div></>}
                <p className="review-hint">Check similar characters such as O / 0 and I / 1. Model confidence does not verify a plate. Manual entry is always available.</p>
                <button className="button primary save-button" disabled={busy || !plate.trim()}>✓ Save vehicle record</button>
              </form>
              <div aria-live="polite">{notice && <p className="notice">{notice}</p>}</div>
              {error && <p className="error" role="alert">{error}</p>}
              <div className="storage-note"><strong>Stored in this browser</strong><p>Your last 100 confirmed records stay on this device. Photos are not saved. Cloud sync is not enabled.</p></div>
            </div>
          </section>
        </div>
        <section className="panel history-panel">
          <div className="panel-heading"><h2>Recent vehicles <span className="count">{history.length}</span></h2><span className="small-label">LOCAL SCAN HISTORY</span></div>
          {history.length ? <div className="table-scroll"><table><thead><tr><th>License plate</th><th>Recorded</th><th>Source</th></tr></thead><tbody>{history.map(record => <tr key={record.id}><td><span className="table-plate">{record.plate}</span></td><td>{new Date(record.time).toLocaleString()}</td><td><span className="source-label">{record.source}</span></td></tr>)}</tbody></table></div> : <div className="history-empty"><span className="empty-history-icon">≡</span><div><strong>Your vehicle log starts here</strong><p>Confirmed license plates will appear here after you save them.</p></div></div>}
        </section>
        <details className="existing-todos"><summary>Existing Supabase todos</summary>{todoStatus ? <p>{todoStatus}</p> : todos.length ? <ul>{todos.map(todo => <li key={todo.id}>{todo.name}</li>)}</ul> : <p>No todos found.</p>}</details>
        <footer><span>SmartPark / Smart parking system</span><span>Review every plate before use</span></footer>
      </main>
    </div>
  )
}
