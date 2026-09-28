from io import BytesIO
from types import SimpleNamespace as Obj
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from PIL import Image
from backend.app import create_app


def photo():
    output = BytesIO()
    Image.new('RGB', (200, 100), 'white').save(output, format='PNG')
    return output.getvalue()


def detection(text='ABC123', confidence=.95, box=(-10, 20, 120, 60)):
    return Obj(detection=Obj(confidence=.9, bounding_box=Obj(x1=box[0], y1=box[1], x2=box[2], y2=box[3])), ocr=Obj(text=text, confidence=[confidence] * len(text)) if text else None)


class ApiTests(unittest.TestCase):
    def client(self, results=()):
        return TestClient(create_app(lambda: Obj(predict=lambda image: results)), base_url='http://localhost')

    def test_multiple_plates_boxes_confidence_and_no_cache(self):
        with self.client([detection('LOW123', .4), detection(), detection('')]) as client:
            response = client.post('/api/recognize', content=photo(), headers={'content-type': 'image/png'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['cache-control'], 'no-store')
            data = response.json()
            self.assertEqual(len(data['plates']), 3)
            self.assertEqual(data['plates'][0]['text'], 'ABC123')
            self.assertEqual(data['plates'][0]['box'], {'x': 0, 'y': .2, 'w': .6, 'h': .4})
            self.assertEqual(data['plates'][0]['recognitionConfidence'], .95)
            self.assertEqual(data['plates'][-1]['text'], '')

    def test_no_detection_is_success(self):
        with self.client() as client:
            response = client.post('/api/recognize', content=photo(), headers={'content-type': 'image/png'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.json()['plates'], [])

    def test_invalid_empty_oversize_and_unsupported_images(self):
        with self.client() as client:
            self.assertEqual(client.post('/api/recognize', content=b'bad', headers={'content-type': 'image/png'}).status_code, 400)
            self.assertEqual(client.post('/api/recognize', content=b'', headers={'content-type': 'image/png'}).status_code, 400)
            self.assertEqual(client.post('/api/recognize', content=photo(), headers={'content-type': 'text/plain'}).status_code, 415)
            with patch('backend.app.MAX_BYTES', 8):
                self.assertEqual(client.post('/api/recognize', content=photo(), headers={'content-type': 'image/png'}).status_code, 413)
            with patch('backend.app.MAX_PIXELS', 10):
                self.assertEqual(client.post('/api/recognize', content=photo(), headers={'content-type': 'image/png'}).status_code, 413)

    def test_rejects_remote_origins_and_hosts(self):
        with self.client() as client:
            self.assertEqual(client.get('/api/health', headers={'origin': 'https://example.com'}).status_code, 403)
            self.assertEqual(client.get('/api/health', headers={'host': 'example.com'}).status_code, 400)
            self.assertTrue(client.get('/api/health', headers={'origin': 'http://127.0.0.1:5173'}).json()['ready'])

    def test_missing_models_are_actionable(self):
        def unavailable():
            raise RuntimeError('missing')
        with patch('backend.app.logging.exception'), TestClient(create_app(unavailable), base_url='http://localhost') as client:
            self.assertEqual(client.get('/api/health').status_code, 503)
            response = client.post('/api/recognize', content=photo(), headers={'content-type': 'image/png'})
            self.assertEqual(response.status_code, 503)
            self.assertIn('setup:models', response.json()['detail'])

    def test_failed_inference_releases_lock(self):
        def broken(image):
            raise RuntimeError('internal details')
        with patch('backend.app.logging.exception'), TestClient(create_app(lambda: Obj(predict=broken)), base_url='http://localhost') as client:
            for _ in range(2):
                response = client.post('/api/recognize', content=photo(), headers={'content-type': 'image/png'})
                self.assertEqual(response.status_code, 500)
                self.assertNotIn('internal details', response.text)


if __name__ == '__main__':
    unittest.main()
