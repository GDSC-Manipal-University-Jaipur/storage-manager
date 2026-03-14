import sys
import json
import struct
import psutil
import os
import datetime

# Configuration
DEFAULT_MIN_SIZE = 1 * 1024**3          # 1 GB assumed if unknown
RESERVED_SPACE = 5 * 1024**3            # Always keep 5 GB free
ACTIVE_RESERVATIONS = 0

STATS_FILE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "stats.json")

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

def log(msg):
    try:
        log_file = os.path.join(os.path.dirname(os.path.abspath(__file__)), "native_app.log")
        now = datetime.datetime.now().strftime('%Y-%m-%d %H:%M:%S')
        with open(log_file, "a", encoding="utf-8") as f:
            f.write(f"[{now}] {msg}\n")
    except Exception:
        pass

def get_message():
    raw_length = sys.stdin.buffer.read(4)
    if len(raw_length) == 0:
        return None
    message_length = struct.unpack('@I', raw_length)[0]
    message = sys.stdin.buffer.read(message_length).decode('utf-8')
    return json.loads(message)

def send_message(message):
    encoded_message = json.dumps(message).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('@I', len(encoded_message)))
    sys.stdout.buffer.write(encoded_message)
    sys.stdout.buffer.flush()

def bytes_to_gb(b):
    return b / 1024**3

def handle_info(path):
    log(f"Received info requested for path: {path}")
    if path and os.path.isfile(path):
        path = os.path.dirname(path)
    if not path or path == '':
        path = os.path.expanduser('~') or '/'
    
    try:
        resolved_path = os.path.realpath(path)
        usage = psutil.disk_usage(resolved_path)
    except Exception as e:
        error_msg = f"Path '{path}' not accessible: {str(e)}"
        log(error_msg)
        return {"ok": False, "error": error_msg}

    free = usage.free
    total = usage.total
    used = usage.used
    percent_used = (used / total) * 100 if total > 0 else 0
    
    log(f"Info results: free={bytes_to_gb(free):.2f} GB")
    return {
        "ok": True,
        "path": resolved_path,
        "total": total,
        "used": used,
        "free": free,
        "percent_used": round(percent_used, 2),
        "total_gb": round(bytes_to_gb(total), 2),
        "used_gb": round(bytes_to_gb(used), 2),
        "free_gb": round(bytes_to_gb(free), 2)
    }

def handle_check(size_str, path):
    global ACTIVE_RESERVATIONS
    log(f"Received check requested for path={path}, size={size_str}")
    
    try:
        size = int(size_str) if size_str and int(size_str) > 0 else DEFAULT_MIN_SIZE
    except ValueError:
        size = DEFAULT_MIN_SIZE

    required_space = size + RESERVED_SPACE + ACTIVE_RESERVATIONS

    if path and os.path.isfile(path):
        path = os.path.dirname(path)
    if not path or path == '':
        path = os.path.expanduser('~') or '/'

    try:
        resolved_path = os.path.realpath(path)
        usage = psutil.disk_usage(resolved_path)
    except Exception as e:
        error_msg = f"Path '{path}' not accessible: {str(e)}"
        log(error_msg)
        return {"ok": False, "error": error_msg}

    free = usage.free
    total = usage.total
    used = usage.used

    if free < required_space:
        msg = f" Not enough space. Free: {bytes_to_gb(free):.2f} GB, Required: {bytes_to_gb(required_space):.2f} GB"
        log(msg)
        return {
            "ok": False,
            "total": total,
            "used": used,
            "free": free,
            "reserved": RESERVED_SPACE,
            "error": msg
        }
    else:
        ACTIVE_RESERVATIONS += size
        msg = f" Enough space. Reserved {bytes_to_gb(size):.2f} GB. Active reservations: {bytes_to_gb(ACTIVE_RESERVATIONS):.2f} GB"
        log(msg)
        return {
            "ok": True,
            "total": total,
            "used": used,
            "free": free,
            "reserved": RESERVED_SPACE,
            "active_reserved": ACTIVE_RESERVATIONS
        }

def handle_download_action(action_type, download_id):
    stats = load_stats()
    if action_type in stats:
        stats[action_type] += 1
        save_stats(stats)
        log(f"Received {action_type} request for download {download_id}. Total {action_type}s: {stats[action_type]}")
        return {
            "ok": True, 
            "command": action_type, 
            "id": download_id
        }
    return {"ok": False, "error": f"Invalid action type {action_type}"}

def handle_get_stats():
    stats = load_stats()
    # log(f"Received get_stats request. Current stats: {stats}") # Too noisy for polling
    return {
        "ok": True,
        "stats": stats
    }

def main():
    log("Native messaging host started")
    while True:
        try:
            msg = get_message()
            if not msg:
                log("Received empty message. Exiting.")
                break
            
            action = msg.get("action")
            
            if action == "info":
                response = handle_info(msg.get("path", "/"))
            elif action == "check":
                response = handle_check(msg.get("size"), msg.get("path", "/"))
            elif action in ["pause", "resume", "cancel"]:
                response = handle_download_action(action, msg.get("id"))
            elif action == "get_stats":
                response = handle_get_stats()
            else:
                log(f"Unknown action: {action}")
                response = {"ok": False, "error": f"Unknown action: {action}"}
                
            send_message(response)
        except Exception as e:
            log(f"Exception: {str(e)}")
            break
    log("Native messaging host exiting.")

if __name__ == '__main__':
    main()
