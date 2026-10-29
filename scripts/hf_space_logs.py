#!/usr/bin/env python3
"""
Dump the buffered run/build logs of the ISL-engine Space (huggingface_hub 1.x:
`HfApi.fetch_space_logs`). The `/runtime` endpoint only carries a one-line
`errorMessage`; the real traceback lives in these logs.

Usage:
    python scripts/hf_space_logs.py            # run logs (stdout/stderr of app.py)
    python scripts/hf_space_logs.py --build    # pip/build logs
"""

from __future__ import annotations

import argparse
import os
import sys

from huggingface_hub import HfApi

REPO_ID = os.environ.get("HF_SPACE_REPO", "Adarshmani/missingwhisper-isl-engine-techbound")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--build", action="store_true", help="fetch build logs instead of run logs")
    parser.add_argument("--tail", type=int, default=120, help="number of lines to print")
    args = parser.parse_args()

    api = HfApi()
    try:
        lines = list(api.fetch_space_logs(REPO_ID, build=args.build))
    except Exception as exc:  # empty buffer / not authorised returns an error
        print(f"[error] could not fetch {'build' if args.build else 'run'} logs: {exc}", file=sys.stderr)
        return 1

    print(f"[{len(lines)} lines total; last {min(args.tail, len(lines))}]")
    for line in lines[-args.tail :]:
        print(line.rstrip())
    return 0


if __name__ == "__main__":
    sys.exit(main())
