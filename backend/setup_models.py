"""Run once with internet access. Downloads public models, never user images."""
from fast_plate_ocr.inference.hub import download_model as download_ocr
from open_image_models.detection.core.hub import download_model as download_detector
from backend.models import MODEL_DIR, DETECTOR_NAME, OCR_NAME, create_engine

if __name__ == '__main__':
    MODEL_DIR.mkdir(parents=True, exist_ok=True)
    download_detector(DETECTOR_NAME, save_directory=MODEL_DIR)
    download_ocr(OCR_NAME, save_directory=MODEL_DIR)
    create_engine()
    print('Local ALPR models ready. Recognition can now run without internet.')
