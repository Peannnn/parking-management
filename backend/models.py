"""Model setup is explicit; inference never downloads files or sends images out."""
from pathlib import Path

MODEL_DIR = Path(__file__).resolve().parent / 'models'
DETECTOR_NAME = 'yolo-v9-t-384-license-plate-end2end'
OCR_NAME = 'cct-xs-v2-global-model'
DETECTOR_PATH = MODEL_DIR / 'yolo-v9-t-384-license-plates-end2end.onnx'
OCR_PATH = MODEL_DIR / 'cct_xs_v2_global.onnx'
OCR_CONFIG = MODEL_DIR / 'cct_xs_v2_global_plate_config.yaml'


def create_engine():
    for path in (DETECTOR_PATH, OCR_PATH, OCR_CONFIG):
        if not path.is_file():
            raise RuntimeError('Local models are missing. Run npm run setup:models first.')
    import onnxruntime as ort
    ort.disable_telemetry_events()
    from fast_alpr import ALPR
    from open_image_models.detection.core.yolo_v9.inference import YoloV9Detector

    options = ort.SessionOptions()
    options.intra_op_num_threads = 2
    options.inter_op_num_threads = 1
    detector = YoloV9Detector(
        model_path=DETECTOR_PATH,
        class_labels=['License Plate'],
        conf_thresh=0.4,
        providers=['CPUExecutionProvider'],
        sess_options=options,
    )
    return ALPR(
        detector=detector,
        ocr_model=None,
        ocr_model_path=OCR_PATH,
        ocr_config_path=OCR_CONFIG,
        ocr_device='cpu',
        ocr_providers=['CPUExecutionProvider'],
        ocr_sess_options=options,
    )
