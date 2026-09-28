"""Real CPU-model smoke test. No network calls are permitted during model load/inference."""
from io import BytesIO
from pathlib import Path
from unittest.mock import patch
import json
import socket
from PIL import Image
from fastapi.testclient import TestClient
from backend.app import create_app

sample = Path('tests/fixtures/vehicle.png')
if not sample.is_file():
    raise SystemExit('Missing public fixture: see tests/fixtures/README.md')
original_connect = socket.socket.connect
def local_only(sock, address):
    if address[0] not in {'127.0.0.1', '::1', 'localhost'}:
        raise AssertionError(f'Unexpected external network access: {address[0]}')
    return original_connect(sock, address)

with patch('socket.socket.connect', new=local_only):
    with TestClient(create_app(), base_url='http://localhost') as client:
        assert client.get('/api/health').json()['ready']
        response = client.post('/api/recognize', content=sample.read_bytes(), headers={'content-type': 'image/png'})
        assert response.status_code == 200, response.text
        data = response.json()
        assert any(item['text'] == '5AU5341' for item in data['plates']), data
        print(json.dumps(data, indent=2))
        blank = BytesIO()
        Image.new('RGB', (640, 480), 'white').save(blank, 'PNG')
        response = client.post('/api/recognize', content=blank.getvalue(), headers={'content-type': 'image/png'})
        assert response.json()['plates'] == [], response.text
        print('Offline real-model API smoke test passed; blank image returned no plates.')
