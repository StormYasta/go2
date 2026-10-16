FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    YOLO_CONFIG_DIR=/tmp/ultralytics

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --upgrade pip \
    && pip install --index-url https://download.pytorch.org/whl/cpu torch torchvision \
    && pip install -r requirements.txt

# Fail during build (not at container startup) if the pinned MediaPipe package
# no longer exposes the legacy Hands API used by this MVP.
RUN python -c "import mediapipe as mp; assert mp.__version__ == '0.10.21'; assert hasattr(mp, 'solutions'); _ = mp.solutions.hands.Hands; print('MediaPipe', mp.__version__, 'legacy Hands API OK')"

RUN python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')"

COPY app ./app
COPY static ./static

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
