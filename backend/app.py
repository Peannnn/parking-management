"""Loopback-only ALPR API. Photos remain in memory for one request."""
from contextlib import asynccontextmanager
from io import BytesIO
import logging
import math
from statistics import mean
from threading import Lock
from time import perf_counter
from urllib.parse import urlsplit
import warnings

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from PIL import Image, ImageOps, UnidentifiedImageError
from starlette.concurrency import run_in_threadpool
from starlette.middleware.trustedhost import TrustedHostMiddleware

from backend.models import create_engine

MAX_BYTES = 15 * 1024 * 1024
MAX_PIXELS = 24_000_000
ALLOWED_TYPES = {'image/jpeg', 'image/png', 'image/webp'}


def decode_image(data):
    try:
        with warnings.catch_warnings():
            warnings.simplefilter('error', Image.DecompressionBombWarning)
            with Image.open(BytesIO(data)) as original:
                if original.format not in {'JPEG', 'PNG', 'WEBP'}:
                    raise HTTPException(415, 'Use a JPG, PNG, or WebP photo.')
                if original.width * original.height > MAX_PIXELS:
                    raise HTTPException(413, 'Photo exceeds 24 megapixels. Resize it and try again.')
                image = ImageOps.exif_transpose(original).convert('RGB')
                # Models use BGR, and boxes refer to this orientation-corrected image.
                return np.ascontiguousarray(np.asarray(image)[:, :, ::-1])
    except HTTPException:
        raise
    except (Image.DecompressionBombWarning, Image.DecompressionBombError):
        raise HTTPException(413, 'Photo dimensions are too large.') from None
    except (UnidentifiedImageError, OSError, ValueError):
        raise HTTPException(400, 'This image could not be decoded. Try a different photo.') from None


def confidence(value):
    if isinstance(value, (list, tuple)):
        value = mean(value) if value else 0
    value = float(value or 0)
    return round(max(0, min(1, value)), 4) if math.isfinite(value) else 0


def recognize(engine, data):
    image = decode_image(data)
    height, width = image.shape[:2]
    start = perf_counter()
    results = engine.predict(image)
    plates = []
    for result in results:
        box = result.detection.bounding_box
        x1, y1 = max(0, min(width, int(box.x1))), max(0, min(height, int(box.y1)))
        x2, y2 = max(0, min(width, int(box.x2))), max(0, min(height, int(box.y2)))
        if x2 <= x1 or y2 <= y1:
            continue
        plates.append({
            'text': result.ocr.text.strip().upper() if result.ocr else '',
            'detectionConfidence': confidence(result.detection.confidence),
            'recognitionConfidence': confidence(result.ocr.confidence) if result.ocr else 0,
            'box': {'x': x1 / width, 'y': y1 / height, 'w': (x2 - x1) / width, 'h': (y2 - y1) / height},
        })
    plates.sort(key=lambda plate: (bool(plate['text']), plate['recognitionConfidence']), reverse=True)
    return {'plates': plates, 'width': width, 'height': height, 'elapsedMs': round((perf_counter() - start) * 1000)}


def create_app(engine_factory=create_engine):
    @asynccontextmanager
    async def lifespan(app):
        app.state.engine = None
        app.state.problem = ''
        try:
            app.state.engine = await run_in_threadpool(engine_factory)
        except Exception:
            logging.exception('Could not initialize local ALPR models')
            app.state.problem = 'Local models are unavailable. Run npm run setup:models, then restart npm run api.'
        yield
        app.state.engine = None

    app = FastAPI(lifespan=lifespan, docs_url=None, redoc_url=None)
    app.add_middleware(TrustedHostMiddleware, allowed_hosts=['127.0.0.1', 'localhost', '[::1]'])
    scan_lock = Lock()

    @app.middleware('http')
    async def local_origin(request, call_next):
        origin = request.headers.get('origin')
        if origin:
            try:
                parsed = urlsplit(origin)
                allowed = parsed.scheme in {'http', 'https'} and parsed.hostname in {'localhost', '127.0.0.1', '::1'}
            except ValueError:
                allowed = False
            if not allowed:
                return JSONResponse({'detail': 'Only local app requests are accepted.'}, status_code=403)
        response = await call_next(request)
        response.headers['Cache-Control'] = 'no-store'
        return response

    @app.get('/api/health')
    def health():
        ready = app.state.engine is not None
        return JSONResponse({'ready': ready, 'detail': app.state.problem, 'processing': 'local-cpu'}, status_code=200 if ready else 503)

    @app.post('/api/recognize')
    async def scan(request: Request):
        if request.headers.get('content-type', '').split(';')[0] not in ALLOWED_TYPES:
            raise HTTPException(415, 'Use a JPG, PNG, or WebP photo.')
        if app.state.engine is None:
            raise HTTPException(503, app.state.problem)
        if not scan_lock.acquire(blocking=False):
            raise HTTPException(429, 'Another photo is being processed. Please retry in a moment.')
        try:
            data = bytearray()
            async for chunk in request.stream():
                if len(data) + len(chunk) > MAX_BYTES:
                    raise HTTPException(413, 'Photo exceeds the 15 MB upload limit.')
                data.extend(chunk)
            if not data:
                raise HTTPException(400, 'Select a photo first.')
            return await run_in_threadpool(recognize, app.state.engine, data)
        except HTTPException:
            raise
        except Exception:
            logging.exception('Local inference failed')
            raise HTTPException(500, 'Local recognition failed. Try a different photo or restart the local service.') from None
        finally:
            scan_lock.release()

    return app


app = create_app()

if __name__ == '__main__':
    import uvicorn
    uvicorn.run(app, host='127.0.0.1', port=8000, access_log=False)
