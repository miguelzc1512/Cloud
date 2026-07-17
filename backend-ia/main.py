import io
import os
import cv2
import numpy as np
from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from deepface import DeepFace
from PIL import Image

app = FastAPI(title="Face Analysis Microservice")

class AnalyzeRequest(BaseModel):
    imagePath: str

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/analyze")
async def analyze_image(req: AnalyzeRequest):
    try:
        if not os.path.exists(req.imagePath):
            return JSONResponse(status_code=404, content={"error": f"File not found: {req.imagePath}"})

        image = Image.open(req.imagePath).convert("RGB")
        img_array = np.array(image)
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)

        representations = DeepFace.represent(
            img_path=img_bgr,
            detector_backend="retinaface",
            enforce_detection=False
        )

        results = []
        for rep in representations:
            confidence = rep.get("face_confidence", 0)
            facial_area = rep.get("facial_area", {})
            # Only include actual detected faces (confidence > 0)
            if confidence and confidence > 0 and facial_area:
                results.append({
                    "embedding": rep.get("embedding"),
                    "facial_area": facial_area,
                    "confidence": confidence
                })

        return JSONResponse(content={"faces": results, "total": len(results)})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})
