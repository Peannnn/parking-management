# Parkcontrol — local automatic license plate recognition

A React + Vite parking workspace with a Python ALPR engine running on this computer. Uploading a vehicle photo automatically detects plate locations, crops each detected plate internally, and reads the characters with a dedicated license-plate model. Multiple plates are selectable, with detection and recognition confidence shown separately. Review or edit a result before saving.

## Run on this computer

The Python environment and models have already been installed in this project. From the directory containing `package.json`:

```powershell
npm run dev
```

This starts the React app and local API together. Open the Vite URL printed in the terminal, normally http://127.0.0.1:5173. Keep the terminal open; Ctrl+C stops both processes. Ports 5173 (UI, or Vite's next free port) and 8000 (API) are used. To preserve records from the earlier app, continue using http://localhost:5173 — browser storage is separate for each hostname and port.

## One-time setup on another computer

Requires Python 3.10+ (tested on 3.12) and Node 22.13+ or 24+. In PowerShell:

```powershell
npm install
py -3.12 -m venv .venv
.\\.venv\\Scripts\\python.exe -m pip install -r backend/requirements-lock.txt
npm run setup:models
npm run dev
```

If using another Python version/platform, install `backend/requirements.txt` instead of the lock file if compatible wheels differ. On macOS/Linux use `python3 -m venv .venv` and `.venv/bin/python -m pip install -r backend/requirements.txt`. The npm launchers automatically choose the virtual environment's Python path.

The one-time model setup downloads about 11 MB of public models into `backend/models/`, then verifies they load. The API only loads those files; it does not download anything during recognition. If models are missing, run `npm run setup:models` and restart the app.

## Use

1. Upload a JPG, PNG, or WebP photo (up to 15 MB and 24 megapixels).
2. Recognition starts immediately. No crop selection or second scan click is needed.
3. Detected plates are outlined on the photo. Select a box or a plate button when several are found.
4. Review/edit the plate, then save the record. Repeat selection and save for other plates.
5. If no plate is detected or characters cannot be read, try a clearer, closer photo or enter the plate manually. Retry recognition is available if the engine was not running.

The browser normalizes image orientation, strips metadata, and limits the longest side to 3000 pixels before sending pixels to the local API. Blurry, tiny, angled, obscured, or unfamiliar plate styles can still fail. The model recognizes Latin letters/digits; confidence scores are not a guarantee or plate validation. This workflow is for uploaded still photos, not live camera tracking.

## How processing stays local

* The browser sends the photo to `/api/recognize`; Vite proxies it exclusively to `127.0.0.1:8000`.
* The Python service binds only to loopback and runs both ONNX models using the CPU. No cloud ALPR API, account, key, or GPU is needed.
* The backend processes photos in memory, without writing photos or recognition results to disk. It handles one recognition request at a time.
* ONNX telemetry is disabled. Model loading uses explicit local paths. The real-model smoke test blocks external Python socket connections during initialization and recognition.
* Confirmed records remain in browser localStorage (last 100). Existing records are preserved. Clearing browser site data removes them; photos are not included in history.
* The optional pre-existing Supabase todo list still contacts your Supabase project if configured. It receives no uploaded photos or new vehicle records. This app is for local use; the included Vite proxy is not a public deployment configuration.

## Models and architecture

Based on [FastALPR](https://github.com/ankandrew/fast-alpr):

* Detector: `yolo-v9-t-384-license-plate-end2end` from [open-image-models](https://github.com/ankandrew/open-image-models).
* Recognizer: `cct-xs-v2-global-model` from [fast-plate-ocr](https://github.com/ankandrew/fast-plate-ocr).

ALPR still includes character recognition internally, but replaces the old general-purpose Tesseract scanner with trained automatic plate detection and a dedicated plate recognizer. This implementation crops detected rectangles; it does not promise perspective rectification.

|File|Responsibility|
|-|-|
|`src/App.jsx`|Upload, automatic recognition, detection boxes, selection, review, history|
|`src/alpr.js`|Local API request, timeout, actionable failures|
|`src/scanner.js`|Backward-compatible browser history persistence|
|`backend/app.py`|Image validation, local HTTP API, CPU inference, normalized boxes|
|`backend/models.py`|Local model paths and model initialization|
|`backend/setup\_models.py`|One-time public model downloads|
|`scripts/dev.mjs`|Starts/stops local API and Vite together|
|`vite.config.js`|Loopback-only API proxy for development and preview|

## Checks and separate processes

```powershell
npm run build
npm run lint
npm test
npm run test:api
.\\.venv\\Scripts\\python.exe -m backend.smoke\_test
```

The real-model smoke test recognizes the public vehicle fixture as `5AU5341` and checks that a blank photo returns no detections, with external network connections blocked. API tests cover multiple detections, unreadable plates, invalid/oversized images, local origin checks, missing models, and inference failures. These tests do not establish accuracy for every country or lighting condition.

To run components separately use `npm run api` and `npm run dev:web` in separate terminals. To preview a production build locally, run `npm run build`, then `npm run api` and `npm run preview`. A static `dist` deployment alone cannot perform local Python inference.

