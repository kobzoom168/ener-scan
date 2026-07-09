FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends git libgl1 libglib2.0-0 && rm -rf /var/lib/apt/lists/*

RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
RUN pip install --no-cache-dir fastapi "uvicorn[standard]" pillow numpy opencv-python-headless onnxruntime "rembg==2.0.61" pydantic
RUN pip install --no-cache-dir "lightglue @ git+https://github.com/cvg/LightGlue.git"

# Pre-download all model weights into the image (no cold-start downloads in prod)
RUN python -c "import torch; torch.hub.load('facebookresearch/dinov2','dinov2_vits14')"
RUN python -c "from lightglue import LightGlue, SuperPoint; SuperPoint(max_num_keypoints=512).eval(); LightGlue(features='superpoint').eval()"
RUN python -c "from rembg import new_session; new_session('u2netp')"

WORKDIR /app
COPY app.py /app/app.py

EXPOSE 8077
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8077", "--workers", "1"]
