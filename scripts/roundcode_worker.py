#!/usr/bin/env python3
"""Opt-in worker using the bundled device-local, non-Java circle decoder.

Configure ROUND_CODE_WORKER_KEY to match the backend. FTX_ROUNDCODE_DECODER
can optionally override the bundled runtime; no Java or server decoder is used.
"""
import argparse
import base64
import os
import time
import requests
from roundcode_client import MAX_IMAGE, decoder_command, register_task, server_root, valid_task


def process_one(server, key, post=requests.post):
    response = post(server + "/api/device/wechat-qr/decode-task/claim", json={},
                    headers={"X-Round-Code-Worker": key}, timeout=8)
    if response.status_code != 200:
        raise RuntimeError("Claim rejected or unavailable")
    body = response.json()
    if body.get("code") != 0:
        raise RuntimeError("Claim unavailable")
    task = body.get("data", {}).get("task")
    if task is None:
        return False
    if not valid_task(task) or task.get("mime") not in ("image/png", "image/jpeg"):
        raise RuntimeError("Invalid task")
    encoded = task.get("imageBase64")
    if not isinstance(encoded, str) or len(encoded) > ((MAX_IMAGE + 2) // 3) * 4:
        raise RuntimeError("Image exceeds worker budget")
    try:
        image = base64.b64decode(encoded, validate=True)
    except ValueError:
        raise RuntimeError("Invalid task image") from None
    if not register_task(task, image, task["mime"], server, post):
        raise RuntimeError("Local decode or registration unavailable")
    return True


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--server", required=True)
    parser.add_argument("--worker-key-env", default="ROUND_CODE_WORKER_KEY", help="Environment variable name, never the secret itself")
    args = parser.parse_args()
    try:
        server = server_root(args.server)
        if not decoder_command():
            parser.error("Local circle decoder is disabled or runtime resources are missing")
        key = os.environ.get(args.worker_key_env, "").strip()
        if not key:
            parser.error("Worker key environment variable is missing")
    except ValueError as error:
        parser.error(str(error))
    print("Non-Java circle-code worker ready; press Ctrl+C to stop. No task credentials are logged.")
    try:
        while True:
            try:
                handled = process_one(server, key)
                time.sleep(1 if handled else 8)
            except Exception:
                print("Decoder task unavailable; retrying after 30 seconds. Ordinary/WeChat scanning is unaffected.")
                time.sleep(30)
    except KeyboardInterrupt:
        print("Worker stopped.")


if __name__ == "__main__":
    main()
