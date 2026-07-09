"""
Ener vision sidecar — instance-level object re-identification primitives.

Endpoints (all CPU):
  GET  /healthz              → liveness + model state
  POST /embed  {image_b64}   → rembg crop → DINOv2 ViT-S/14 → 384-d L2-normalized embedding
  POST /match  {image_a_b64, image_b_b64}
                             → rembg crop both → SuperPoint(512kp) + LightGlue → RANSAC inliers

Design: models lazy-load on first request behind a lock (uvicorn single worker);
torch limited to 2 threads so scans never starve the Node stack on the 4-core box.
"""
import base64
import io
import threading

import numpy as np
from fastapi import FastAPI
from pydantic import BaseModel
from PIL import Image

app = FastAPI()
_lock = threading.Lock()
_m = {}

IMAGENET_MEAN = np.array([0.485, 0.456, 0.406], dtype=np.float32)
IMAGENET_STD = np.array([0.229, 0.224, 0.225], dtype=np.float32)


def models():
    with _lock:
        if "ready" not in _m:
            import torch
            import cv2
            from rembg import new_session, remove
            from lightglue import LightGlue, SuperPoint
            from lightglue.utils import rbd

            torch.set_num_threads(2)
            _m["torch"] = torch
            _m["cv2"] = cv2
            _m["remove"] = remove
            _m["rembg_session"] = new_session("u2netp")
            _m["dino"] = torch.hub.load("facebookresearch/dinov2", "dinov2_vits14").eval()
            _m["extractor"] = SuperPoint(max_num_keypoints=512).eval()
            _m["matcher"] = LightGlue(features="superpoint").eval()
            _m["rbd"] = rbd
            _m["ready"] = True
    return _m


def decode_image(b64: str) -> Image.Image:
    raw = base64.b64decode(b64.split(",")[-1])
    return Image.open(io.BytesIO(raw)).convert("RGB")


def crop_object(img: Image.Image):
    """Foreground bbox via rembg mask (u2netp); falls back to the full frame."""
    m = models()
    try:
        mask_img = m["remove"](img, session=m["rembg_session"], only_mask=True)
        mask = np.asarray(mask_img)
        ys, xs = np.where(mask > 60)
        if len(xs) > 100:
            x1, x2, y1, y2 = int(xs.min()), int(xs.max()), int(ys.min()), int(ys.max())
            w, h = img.size
            mx = int((x2 - x1) * 0.06) + 2
            my = int((y2 - y1) * 0.06) + 2
            box = (max(0, x1 - mx), max(0, y1 - my), min(w, x2 + mx), min(h, y2 + my))
            if (box[2] - box[0]) > 40 and (box[3] - box[1]) > 40:
                return img.crop(box), True
    except Exception:
        pass
    return img, False


def dino_embed(img: Image.Image):
    m = models()
    torch = m["torch"]
    im = img.resize((224, 224), Image.BILINEAR)
    arr = (np.asarray(im, dtype=np.float32) / 255.0 - IMAGENET_MEAN) / IMAGENET_STD
    t = torch.from_numpy(arr).permute(2, 0, 1).unsqueeze(0)
    with torch.no_grad():
        v = m["dino"](t)[0].numpy()
    v = v / (np.linalg.norm(v) + 1e-8)
    return v.astype(np.float32).tolist()


def gray_tensor(img: Image.Image, max_side: int = 640):
    m = models()
    torch = m["torch"]
    w, h = img.size
    s = max_side / max(w, h)
    if s < 1:
        img = img.resize((max(32, int(w * s)), max(32, int(h * s))), Image.BILINEAR)
    g = np.asarray(img.convert("L"), dtype=np.float32) / 255.0
    return torch.from_numpy(g)[None, None]


class EmbedReq(BaseModel):
    image_b64: str


class MatchReq(BaseModel):
    image_a_b64: str
    image_b_b64: str


@app.get("/healthz")
def healthz():
    return {"ok": True, "loaded": "ready" in _m}


@app.post("/embed")
def embed_ep(req: EmbedReq):
    img = decode_image(req.image_b64)
    crop, cropped = crop_object(img)
    return {
        "embedding": dino_embed(crop),
        "dim": 384,
        "cropped": cropped,
        "model": "dinov2_vits14",
    }


@app.post("/match")
def match_ep(req: MatchReq):
    m = models()
    torch = m["torch"]
    cv2 = m["cv2"]
    a, _ = crop_object(decode_image(req.image_a_b64))
    b, _ = crop_object(decode_image(req.image_b_b64))
    ta, tb = gray_tensor(a), gray_tensor(b)
    with torch.no_grad():
        fa = m["extractor"].extract(ta)
        fb = m["extractor"].extract(tb)
        out = m["matcher"]({"image0": fa, "image1": fb})
    fa2, fb2, out2 = [m["rbd"](x) for x in (fa, fb, out)]
    matches = out2["matches"].cpu().numpy()
    raw = int(len(matches))
    if raw < 4:
        return {"inliers": 0, "raw_matches": raw}
    k0 = fa2["keypoints"].cpu().numpy()[matches[:, 0]]
    k1 = fb2["keypoints"].cpu().numpy()[matches[:, 1]]
    _, mask = cv2.findHomography(k0, k1, cv2.RANSAC, 5.0)
    inliers = int(mask.sum()) if mask is not None else 0
    return {"inliers": inliers, "raw_matches": raw}
