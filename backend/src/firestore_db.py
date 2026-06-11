import json
import os
import time

import firebase_admin
from firebase_admin import credentials, firestore

_db = None


def _get_db():
    global _db
    if _db is None:
        if not firebase_admin._apps:
            sa_val = os.environ["FIREBASE_SERVICE_ACCOUNT_JSON"]
            # Accept either a file path or raw JSON content
            try:
                sa_dict = json.loads(sa_val)
                cred = credentials.Certificate(sa_dict)
            except json.JSONDecodeError:
                cred = credentials.Certificate(sa_val)
            firebase_admin.initialize_app(cred)
        _db = firestore.client()
    return _db


def get_user(uid: str) -> dict | None:
    doc = _get_db().collection("users").document(uid).get()
    return doc.to_dict() if doc.exists else None


def save_user_profile(uid: str, product_description: str, video_style: str) -> None:
    _get_db().collection("users").document(uid).set(
        {
            "productDescription": product_description,
            "videoStyle": video_style,
            "updatedAt": firestore.SERVER_TIMESTAMP,
        },
        merge=True,
    )


def save_tiktok_token(uid: str, token_dict: dict) -> None:
    _get_db().collection("users").document(uid).set(
        {"tiktokToken": token_dict, "tiktokConnectedAt": firestore.SERVER_TIMESTAMP},
        merge=True,
    )


def get_tiktok_token(uid: str) -> dict | None:
    doc = _get_db().collection("users").document(uid).get()
    if not doc.exists:
        return None
    return doc.to_dict().get("tiktokToken")


def clear_tiktok_token(uid: str) -> None:
    _get_db().collection("users").document(uid).update(
        {"tiktokToken": firestore.DELETE_FIELD}
    )


def create_video_job(uid: str) -> str:
    ref = _get_db().collection("videos").document()
    ref.set(
        {
            "userId": uid,
            "status": "queued",
            "script": None,
            "caption": None,
            "pikaPrompt": None,
            "errorMessage": None,
            "publishId": None,
            "localVideoPath": None,
            "createdAt": firestore.SERVER_TIMESTAMP,
        }
    )
    return ref.id


def update_video_job(video_id: str, **fields) -> None:
    _get_db().collection("videos").document(video_id).update(fields)


def get_video_job(video_id: str) -> dict | None:
    doc = _get_db().collection("videos").document(video_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    data["id"] = doc.id
    return data


def list_user_videos(uid: str, limit: int = 20) -> list[dict]:
    docs = (
        _get_db()
        .collection("videos")
        .where("userId", "==", uid)
        .order_by("createdAt", direction=firestore.Query.DESCENDING)
        .limit(limit)
        .stream()
    )
    results = []
    for doc in docs:
        data = doc.to_dict()
        data["id"] = doc.id
        # Firestore timestamps → epoch seconds for JSON serialisation
        for key in ("createdAt",):
            if data.get(key) and hasattr(data[key], "timestamp"):
                data[key] = data[key].timestamp()
        results.append(data)
    return results
