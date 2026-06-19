#!/bin/bash
set -euo pipefail
python3 -c 'import json,os; p=os.environ.get("CLAUDE_TOOL_FILE_PATH","arquivo"); print(json.dumps({"permission":"allow","agent_message":f"🔒 Alerta: {p} sensível (env/lock)."}, ensure_ascii=False))'

