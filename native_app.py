#!/usr/bin/env python3
"""
Native Messaging Host for Storage Manager Extension

Single entry point for all native messaging:
  - Disk info & space checks
  - Download action tracking (pause / resume / cancel)
  - Persistent stats via stats.json
  - Active-reservation accounting

Communication protocol (Chrome Native Messaging):
  stdin  -> 4-byte LE length prefix + UTF-8 JSON
  stdout -> 4-byte LE length prefix + UTF-8 JSON

Messages may use either "action" or "command" as the key name;
both are accepted for compatibility.
"""

import sys
import json
import struct
import shutil
import os
import datetime

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

DEFAULT_MIN_SIZE    = 1 * 1024 ** 3   # 1 GB assumed when size is unknown
RESERVED_SPACE      = 5 * 1024 ** 3   # Always keep 5 GB free on disk
ACTIVE_RESERVATIONS = 0               # Bytes reserved for in-flight downloads

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
STATS_FILE = os.path.join(SCRIPT_DIR, "stats.json")
LOG_FILE   = os.path.join(SCRIPT_DIR, "native_app.log")

# ---------------------------------------------------------------------------
# Logging
# ---------------------------------------------------------------------------

def log(msg):
    try:
        now = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        with open(LOG_FILE, "a", encoding="utf-8") as f:
            f.write(f"[{now}] {msg}\n")
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Stats persistence
# ---------------------------------------------------------------------------

def load_stats():
    if os.path.exists(STATS_FILE):
        try:
            with open(STATS_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return {"pause": 0, "resume": 0, "cancel": 0}


def save_stats(stats):
    try:
        with open(STATS_FILE, "w", encoding="utf-8") as f:
            json.dump(stats, f)
    except Exception:
        pass

# ---------------------------------------------------------------------------
# Native messaging I/O
# ---------------------------------------------------------------------------

def read_message():
    raw = sys.stdin.buffer.read(4)
    if len(raw) == 0:
        return None
    length = struct.unpack("<I", raw)[0]
    body = sys.stdin.buffer.read(length).decode("utf-8")
    return json.loads(body)


def send_message(message):
    encoded = json.dumps(message).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(encoded)))
    sys.stdout.buffer.write(encoded)
    sys.stdout.buffer.flush()

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def bytes_to_gb(b):
    return b / 1024 ** 3


def normalize_path(path):
    if not path:
        return os.path.expanduser("~") or "/"
    if os.path.isfile(path):
        path = os.path.dirname(path)
    try:
        return os.path.realpath(path)
    except (OSError, ValueError):
        return os.path.expanduser("~") or "/"

# ---------------------------------------------------------------------------
# Command handlers
# ---------------------------------------------------------------------------

def handle_info(path):
    log(f"info requested for path: {path}")
    resolved = normalize_path(path)
    try:
        total, used, free = shutil.disk_usage(resolved)
    except Exception as e:
        msg = f"Path '{path}' not accessible: {e}"
        log(msg)
        return {"ok": False, "error": msg}

    percent_used = (used / total * 100) if total > 0 else 0
    log(f"info result: free={bytes_to_gb(free):.2f} GB")
    return {
        "ok": True,
        "path": resolved,
        "total": total,
        "used": used,
        "free": free,
        "percent_used": round(percent_used, 2),
        "total_gb": round(bytes_to_gb(total), 2),
        "used_gb":  round(bytes_to_gb(used),  2),
        "free_gb":  round(bytes_to_gb(free),  2),
    }


def handle_check(size_str, path):
    global ACTIVE_RESERVATIONS
    log(f"check requested: path={path}, size={size_str}")

    try:
        size = int(size_str) if size_str and int(size_str) > 0 else DEFAULT_MIN_SIZE
    except (ValueError, TypeError):
        size = DEFAULT_MIN_SIZE

    required = size + RESERVED_SPACE + ACTIVE_RESERVATIONS
    resolved = normalize_path(path)

    try:
        total, used, free = shutil.disk_usage(resolved)
    except Exception as e:
        msg = f"Path '{path}' not accessible: {e}"
        log(msg)
        return {"ok": False, "error": msg}

    if free < required:
        msg = (
            f"Not enough space. "
            f"Free: {bytes_to_gb(free):.2f} GB, "
            f"Required: {bytes_to_gb(required):.2f} GB"
        )
        log(msg)
        return {
            "ok": False,
            "total": total, "used": used, "free": free,
            "reserved": RESERVED_SPACE,
            "error": msg,
        }

    ACTIVE_RESERVATIONS += size
    log(
        f"check OK — reserved {bytes_to_gb(size):.2f} GB. "
        f"Active reservations: {bytes_to_gb(ACTIVE_RESERVATIONS):.2f} GB"
    )
    return {
        "ok": True,
        "total": total, "used": used, "free": free,
        "reserved": RESERVED_SPACE,
        "active_reserved": ACTIVE_RESERVATIONS,
    }


def handle_download_action(action, download_id):
    stats = load_stats()
    if action not in stats:
        return {"ok": False, "error": f"Invalid action: {action}"}
    stats[action] += 1
    save_stats(stats)
    log(f"{action} recorded for download {download_id}. Total {action}s: {stats[action]}")
    return {"ok": True, "command": action, "id": download_id}


def handle_get_stats():
    return {"ok": True, "stats": load_stats()}


def handle_ping():
    return {"ok": True, "message": "pong"}

# ---------------------------------------------------------------------------
# Main loop
# ---------------------------------------------------------------------------

def main():
    log("Native messaging host started")
    while True:
        try:
            msg = read_message()
            if msg is None:
                log("Empty message — exiting.")
                break

            # Accept either "action" or "command" as the routing key
            action = msg.get("action") or msg.get("command")

            if action == "info":
                response = handle_info(msg.get("path", "/"))
            elif action == "check":
                response = handle_check(msg.get("size"), msg.get("path", "/"))
            elif action in ("pause", "resume", "cancel"):
                response = handle_download_action(action, msg.get("id"))
            elif action == "get_stats":
                response = handle_get_stats()
            elif action == "ping":
                response = handle_ping()
            else:
                log(f"Unknown action: {action}")
                response = {"ok": False, "error": f"Unknown action: {action}"}

            send_message(response)

        except Exception as e:
            log(f"Exception in main loop: {e}")
            break

    log("Native messaging host exiting.")


if __name__ == "__main__":
    main()
