#!/usr/bin/env python3
"""
Deploy apps/isl-engine to a Hugging Face ZeroGPU Space and interconnect it.

The Space is created (or updated) from the local apps/isl-engine directory:
large training artifacts (.venv, __pycache__, npy_files) are never uploaded, and
the Space configuration comes from the README.md frontmatter, which is the single
source of truth for `sdk`, `app_file`, `app_port`, `python_version` and
`hardware: zeroGPU`.

Usage:
    python scripts/deploy_hf_space.py                 # create + upload + watch build
    python scripts/deploy_hf_space.py --dry-run       # show the upload set only
    python scripts/deploy_hf_space.py --status        # runtime + /health, no upload

Target Space (env `HF_SPACE_REPO`, default below) — CI sets it, so the repo is the
only place a Space name is written down.

Requires an authenticated `hf` CLI session (huggingface_hub reads the stored
token; this script never handles or prints credentials). In CI, export
`HF_TOKEN` instead — huggingface_hub reads it the same way.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
import time
from pathlib import Path

from huggingface_hub import HfApi, get_token
from huggingface_hub.errors import HfHubHTTPError, RepositoryNotFoundError

REPO_ID = os.environ.get("HF_SPACE_REPO", "Adarshmani/missingwhisper-isl-engine-techbound")
APP_DIR = Path(__file__).resolve().parent.parent / "apps" / "isl-engine"

# Never shipped: local interpreter, bytecode caches, scratch datasets.
IGNORE_PATTERNS = [
    ".venv/*",
    "venv/*",
    "__pycache__/*",
    "**/__pycache__/*",
    "*.pyc",
    "npy_files/*",
    "debug_uploads/*",
]


def space_card() -> dict:
    """
    Parse the README.md frontmatter, which is the Space's configuration contract.

    `hardware: zeroGPU` + `python_version` must live here (not in the create_repo
    call): the Hub re-applies cardData on every push, so the README is the single
    source of truth and a mismatched API value would be silently overwritten.
    """
    text = (APP_DIR / "README.md").read_text(encoding="utf-8")
    parts = text.split("---", 2)
    if len(parts) < 3 or parts[1].count(":") < 3:
        raise SystemExit("[error] apps/isl-engine/README.md has no YAML frontmatter")
    card: dict[str, object] = {}
    current_list: str | None = None
    for raw in parts[1].splitlines():
        line = raw.rstrip()
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if line.startswith("  - ") and current_list:
            card.setdefault(current_list, []).append(line[4:].strip())
            continue
        key, _, value = line.partition(":")
        key, value = key.strip(), value.strip()
        if not key:
            continue
        if value == "":
            card[key] = []
            current_list = key
        else:
            current_list = None
            card[key] = value.strip('"')
    return card


def assert_card_is_deployable(card: dict) -> None:
    """Fail before uploading if the Space contract drifted from the ZeroGPU recipe."""
    required = {
        "sdk": "gradio",  # sdk: docker needs a PAID plan; gradio+ZeroGPU is the free path
        "app_file": "app.py",
        "app_port": "7860",
        "hardware": "zeroGPU",
    }
    for key, expected in required.items():
        got = card.get(key)
        if str(got) != expected:
            raise SystemExit(f"[error] README frontmatter {key}={got!r}, expected {expected!r}")
    if "sdk_version" in card:
        raise SystemExit(
            "[error] remove sdk_version from the README frontmatter: it pins Gradio and "
            "collides with the Hub's own gradio/spaces install layer (ResolutionImpossible)."
        )


def upload_set() -> list[Path]:
    """Files that will be shipped, for --dry-run review."""
    out: list[Path] = []
    for p in sorted(APP_DIR.rglob("*")):
        if not p.is_file():
            continue
        rel = p.relative_to(APP_DIR).as_posix()
        if any(rel.startswith(pat.rstrip("*")) or rel in (".gitignore",) for pat in IGNORE_PATTERNS):
            continue
        if "__pycache__" in rel or rel.endswith(".pyc"):
            continue
        out.append(p)
    return out


def get_json(url: str) -> dict:
    import requests

    resp = requests.get(url, headers={"Authorization": f"Bearer {get_token()}"}, timeout=30)
    resp.raise_for_status()
    return resp.json()


def poll_build(api: HfApi, timeout_s: int = 1800) -> int:
    """Watch the Space build until it is running, failed, or we time out."""
    space_url = f"https://{REPO_ID.lower().replace('/', '-')}.hf.space"
    deadline = time.time() + timeout_s
    last_stage = None
    while time.time() < deadline:
        try:
            runtime = get_json(f"https://huggingface.co/api/spaces/{REPO_ID}/runtime")
            stage = runtime.get("stage", "unknown")
        except Exception as exc:  # runtime endpoint 404s before the first build
            stage = f"pending ({type(exc).__name__})"

        if stage != last_stage:
            print(f"[stage] {stage}", flush=True)
            last_stage = stage

        if stage == "RUNNING":
            try:
                health = get_json(f"{space_url}/health")
                print(f"[health] {json.dumps(health)}", flush=True)
            except Exception as exc:
                print(f"[health] not reachable yet: {exc}", flush=True)
            print(f"[ok] Space running at {space_url}", flush=True)
            return 0

        if stage in ("RUNTIME_ERROR", "NO_EXISTING_BUILD", "BUILD_ERROR"):
            print(f"[fail] stage={stage}", flush=True)
            # huggingface_hub 1.x dropped get_space_build_logs(); the runtime endpoint
            # carries the container's stderr tail, which is what actually failed here.
            try:
                runtime = get_json(f"https://huggingface.co/api/spaces/{REPO_ID}/runtime")
                detail = runtime.get("errorMessage") or runtime
                print(str(detail)[-4000:], flush=True)
            except Exception as exc:
                print(f"[fail] could not fetch runtime error: {exc}", flush=True)
            return 1

        time.sleep(15)

    print(f"[timeout] build not running after {timeout_s}s — check {space_url}", flush=True)
    return 2


def show_status() -> int:
    api = HfApi()
    try:
        info = api.repo_info(REPO_ID, repo_type="space")
    except RepositoryNotFoundError:
        print(f"[absent] {REPO_ID} does not exist yet", flush=True)
        return 1
    card = info.cardData or {}
    print(f"sdk={card.get('sdk')} hardware={card.get('hardware')} app_file={card.get('app_file')}", flush=True)
    try:
        runtime = get_json(f"https://huggingface.co/api/spaces/{REPO_ID}/runtime")
        print(f"stage={runtime.get('stage')}", flush=True)
        detail = runtime.get("errorMessage")
        if detail:
            print("--- last runtime stderr ---", flush=True)
            print(str(detail)[-3000:], flush=True)
    except Exception as exc:
        print(f"runtime unavailable: {exc}", flush=True)
    files = api.list_repo_files(REPO_ID, repo_type="space")
    print(f"{len(files)} files on the Hub", flush=True)
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--dry-run", action="store_true", help="print the upload set and exit")
    parser.add_argument("--status", action="store_true", help="print Space runtime/config and exit")
    parser.add_argument("--no-watch", action="store_true", help="upload without waiting for the build")
    parser.add_argument("--timeout", type=int, default=1800, help="build watch timeout in seconds")
    parser.add_argument(
        "--hardware",
        default="zero-a10g",
        help=(
            "Hub hardware id. 'zero-a10g' is the free ZeroGPU tier a personal account "
            "may create; 'cpu-basic' is no longer free for Gradio/Docker Spaces "
            "(create_repo answers 402 Payment Required -> needs PRO)."
        ),
    )
    args = parser.parse_args()

    if not APP_DIR.is_dir():
        print(f"[error] missing {APP_DIR}", file=sys.stderr)
        return 1

    if args.status:
        return show_status()

    files = upload_set()
    total_mb = sum(f.stat().st_size for f in files) / 1e6
    print(f"[upload set] {len(files)} files, {total_mb:.1f} MB from {APP_DIR.name}/", flush=True)
    for f in files:
        if f.suffix in {".pth", ".pkl", ".h5", ".npy"}:
            print(f"  model artifact: {f.relative_to(APP_DIR).as_posix()} ({f.stat().st_size / 1e6:.1f} MB)", flush=True)
    if args.dry_run:
        return 0

    api = HfApi(token=get_token())
    card = space_card()
    assert_card_is_deployable(card)
    print(
        f"[card] sdk={card['sdk']} hardware={card['hardware']} "
        f"python={card.get('python_version')} app_file={card['app_file']}",
        flush=True,
    )

    print(f"[create] {REPO_ID} (hardware={args.hardware})", flush=True)
    try:
        api.create_repo(
            REPO_ID,
            repo_type="space",
            space_sdk="gradio",
            space_hardware=args.hardware,
            private=False,
            exist_ok=True,
        )
    except HfHubHTTPError as exc:
        print(f"[fail] create_repo: {exc}", file=sys.stderr, flush=True)
        if "402" in str(exc):
            print(
                "[hint] The Hub only lets a free personal account create Gradio Spaces on "
                "the ZeroGPU tier. Retry with --hardware zero-a10g, or upgrade at "
                "https://huggingface.co/pro. If the quota of free ZeroGPU Spaces is already "
                "used, delete one at https://huggingface.co/spaces?owner=<you> first.",
                file=sys.stderr,
                flush=True,
            )
        return 1

    print("[upload] pushing app source + model artifacts", flush=True)
    api.upload_folder(
        repo_id=REPO_ID,
        repo_type="space",
        folder_path=str(APP_DIR),
        path_in_repo="",
        ignore_patterns=IGNORE_PATTERNS,
        commit_message="Deploy MissingWhisper ISL engine to ZeroGPU Space",
        commit_description=(
            "FastAPI + mounted Gradio app serving static (fingerspelling) and dynamic "
            "(hierarchical transformer) ISL recognition for the MissingWhisper platform."
        ),
    )

    if args.no_watch:
        print("[ok] uploaded; build starts automatically", flush=True)
        return 0

    return poll_build(api, timeout_s=args.timeout)


if __name__ == "__main__":
    sys.exit(main())
