import os
import sqlite3
import hashlib
import hmac
import binascii
from datetime import datetime, timedelta
from typing import Optional, Dict, Any

import jwt

BASE_DIR = os.path.dirname(__file__)
DB_PATH = os.path.join(BASE_DIR, "data.db")
JWT_SECRET = os.getenv("JWT_SECRET", "please_change_this_secret")
JWT_ALG = "HS256"


def _get_conn():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password_hash TEXT NOT NULL,
            salt TEXT NOT NULL,
            region TEXT,
            created_at TEXT NOT NULL
        )
        """
    )
    cur.execute(
        """
        CREATE TABLE IF NOT EXISTS diagnosis_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            crop TEXT,
            location TEXT,
            diagnosis_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY(user_id) REFERENCES users(id)
        )
        """
    )
    conn.commit()
    conn.close()


def _hash_password(password: str, salt: Optional[bytes] = None) -> Dict[str, str]:
    if salt is None:
        salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return {"hash": binascii.hexlify(dk).decode("ascii"), "salt": binascii.hexlify(salt).decode("ascii")}


def _verify_password(password: str, salt_hex: str, hash_hex: str) -> bool:
    salt = binascii.unhexlify(salt_hex)
    expected = binascii.unhexlify(hash_hex)
    dk = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt, 100_000)
    return hmac.compare_digest(dk, expected)


def create_user(username: str, password: str, region: Optional[str] = None) -> Dict[str, Any]:
    init_db()
    parts = _hash_password(password)
    conn = _get_conn()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    try:
        cur.execute(
            "INSERT INTO users (username, password_hash, salt, region, created_at) VALUES (?, ?, ?, ?, ?)",
            (username, parts["hash"], parts["salt"], region, now),
        )
        conn.commit()
        user_id = cur.lastrowid
    except sqlite3.IntegrityError:
        conn.close()
        raise ValueError("username_taken")
    conn.close()
    return {"id": user_id, "username": username, "region": region}


def authenticate_user(username: str, password: str) -> Optional[Dict[str, Any]]:
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT * FROM users WHERE username = ?", (username,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    if not _verify_password(password, row["salt"], row["password_hash"]):
        return None
    return {"id": row["id"], "username": row["username"], "region": row["region"]}


def create_access_token(user: Dict[str, Any], expires_days: int = 7) -> str:
    payload = {
        "sub": user["id"],
        "username": user["username"],
        "exp": datetime.utcnow() + timedelta(days=expires_days),
    }
    token = jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALG)
    return token


def decode_access_token(token: str) -> Optional[Dict[str, Any]]:
    try:
        data = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALG])
        return data
    except Exception:
        return None


def save_diagnosis(user_id: int, diagnosis_json: str, crop: Optional[str] = None, location: Optional[str] = None) -> Dict[str, Any]:
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    now = datetime.utcnow().isoformat()
    cur.execute(
        "INSERT INTO diagnosis_history (user_id, crop, location, diagnosis_json, created_at) VALUES (?, ?, ?, ?, ?)",
        (user_id, crop, location, diagnosis_json, now),
    )
    conn.commit()
    item_id = cur.lastrowid
    conn.close()
    return {"id": item_id, "user_id": user_id, "crop": crop, "location": location, "created_at": now}


def list_diagnosis(user_id: int, limit: int = 100):
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute(
        "SELECT id, crop, location, diagnosis_json, created_at FROM diagnosis_history WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
        (user_id, limit),
    )
    rows = cur.fetchall()
    conn.close()
    out = []
    for r in rows:
        out.append({"id": r["id"], "crop": r["crop"], "location": r["location"], "diagnosis": r["diagnosis_json"], "created_at": r["created_at"]})
    return out


init_db()


def get_user_by_id(user_id: int):
    init_db()
    conn = _get_conn()
    cur = conn.cursor()
    cur.execute("SELECT id, username, region, created_at FROM users WHERE id = ?", (user_id,))
    row = cur.fetchone()
    conn.close()
    if not row:
        return None
    return {"id": row["id"], "username": row["username"], "region": row["region"], "created_at": row["created_at"]}
