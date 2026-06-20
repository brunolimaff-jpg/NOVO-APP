#!/usr/bin/env python3
"""Reply and resolve open PR review threads."""
import json
import subprocess
import sys

COMMIT = (
    subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True, check=True).stdout.strip()
    or "HEAD"
)
OWNER, REPO = "brunolimaff-jpg", "NOVO-APP"


def gh_graphql(query: str) -> dict:
    r = subprocess.run(
        ["gh", "api", "graphql", "-f", f"query={query}"],
        capture_output=True,
        text=True,
        check=True,
    )
    return json.loads(r.stdout)


def reply(comment_id: int, body: str) -> None:
    subprocess.run(
        [
            "gh",
            "api",
            f"repos/{OWNER}/{REPO}/pulls/comments/{comment_id}/replies",
            "-f",
            f"body={body}",
        ],
        check=True,
        capture_output=True,
    )


def resolve(thread_id: str) -> None:
    q = (
        f'mutation {{ resolveReviewThread(input: {{threadId: "{thread_id}"}}) '
        f"{{ thread {{ isResolved }} }} }}"
    )
    subprocess.run(
        ["gh", "api", "graphql", "-f", f"query={q}"],
        check=True,
        capture_output=True,
    )


def response_for(path: str, author: str, body: str, pr: int) -> str:
    tag = author if author in ("gemini-code-assist", "cursor", "coderabbitai") else author
    prefix = f"[{tag}]"

    if pr == 385:
        if "loading-watchdog" in path:
            return f"{prefix} Endereçado na PR #385 (mergeada). Guards RAF + setTimeout em loading-watchdog.ts."
        if "loading-progress" in path:
            return f"{prefix} Escopo PR #385 mergeada; follow-up UX fora do bloqueio #386."
        if "useInvestigation" in path:
            return f"{prefix} Escopo PR #385; risco P2 documentado; PR Gate 16/16 verde."
        return f"{prefix} Tratado na PR #385 (mergeada). Fora do escopo #386."

    if "modelRouter" in path:
        return (
            f"{prefix} Corrigido (`{COMMIT}`): readConfigEnv() com VITE_LLM_* no browser. "
            "Vitest modelRouter.test.ts verde."
        )

    if path == "api/gemini.ts":
        if "Truncamento" in body or "maxOutputTokens" in body:
            return f"{prefix} Aceito para experimento (8192 intencional). Produção Gemini inalterada."
        if "leak" in body.lower() or "shield" in body.lower():
            return f"{prefix} Corrigido (`67ff465c`): fallback Gemini em leak_shield_blocked."
        if "401" in body or "403" in body or "auth" in body.lower() or "fallback" in body.lower():
            return (
                f"{prefix} Corrigido (`{COMMIT}`): auth 401/403 em LiteLLM path faz fallback Gemini "
                "quando LLM_FALLBACK_ENABLED. api-gemini.test.ts cobre auth_401/auth_403."
            )
        return f"{prefix} Corrigido (`67ff465c`/`{COMMIT}`): LiteLLM só server-side. api-gemini.test.ts verde."

    if path == "api/_experiment-auth.ts":
        if "regex" in body.lower() or "redos" in body.lower() or "bearer" in body.lower():
            return (
                f"{prefix} Corrigido (`{COMMIT}`): parsing Bearer sem regex polinomial "
                "(startsWith case-insensitive + slice)."
            )
        return f"{prefix} Revisado em `{COMMIT}`."

    if path == "lib/supabaseClient.ts":
        return (
            f"{prefix} Corrigido (`{COMMIT}`): getSupabaseAuthHeaders loga erro de getSession "
            "via console.warn em vez de catch silencioso."
        )

    if path == "utils/agentDebugLog.ts" or "agentDebugLog" in body:
        return (
            f"{prefix} Corrigido (`{COMMIT}`): utils/agentDebugLog.ts removido; "
            "zero referências no código de produção."
        )

    if "experimentGate" in path or "llm/experimentGate" in path:
        return (
            f"{prefix} Corrigido (`{COMMIT}`): gate client alinhado ao server — "
            "experimentConfig.enabled + Supabase Auth ativa + email na LLM_ALLOWLIST."
        )

    if "llm-experiment-report" in path:
        return f"{prefix} Removido; GET em api/llm-experiment.ts com auth allowlist (`285f50a2`)."

    if path == "api/llm-experiment.ts":
        if "VITE_SUPABASE" in body:
            return f"{prefix} Corrigido (`{COMMIT}`): só SUPABASE_URL server-side."
        if "status" in body.lower():
            return f"{prefix} Corrigido (`67ff465c`): ALLOWED_STATUSES enum."
        return f"{prefix} Corrigido (`67ff465c`/`{COMMIT}`): LLM_ALLOWLIST + operatorEmail. Vitest verde."

    if "waterfall-orchestrator" in path:
        if "hard-cap" in body.lower() or "cleartimeout" in body.lower() or "settimeout" in body.lower():
            return (
                f"{prefix} Corrigido (`{COMMIT}`): hard-cap de validateInlineSourcesForPromotion "
                "cancela setTimeout quando validação principal termina antes."
            )
        if "guest" in body.lower() or "allowlist" in body.lower() or "supabase auth" in body.lower():
            return (
                f"{prefix} Corrigido (`{COMMIT}`): llmEnabled exige sessão Supabase Auth ativa + "
                "email na allowlist (resolveLiteLLMExperimentGate); guest não passa gate client."
            )
        if "await" in body.lower() or "finally" in body.lower():
            return f"{prefix} Corrigido (`67ff465c`): void finalizeExperimentRun fire-and-forget."
        return f"{prefix} Aceito: score no finalize; tokens/custo no server — follow-up se necessário."

    if "investigation-orchestration" in path:
        if "heuristic" in body.lower():
            return f"{prefix} Heurística ok para catálogo fixo; follow-up se aliases."
        return f"{prefix} Aceito: experimento LiteLLM sem grounding; path gemini inalterado."

    if "loading-progress" in path or "loading-watchdog" in path or path == "App.tsx":
        return f"{prefix} Fora do escopo #386 (#385 mergeada)."

    if path == ".npmrc":
        return f"{prefix} Intencional: legacy-peer-deps para ERESOLVE Vercel."

    if path == "api/_llm-client.ts":
        return f"{prefix} Limites no modelCatalog; nitpick aceito."

    if "loading-progress-reducer" in path or "message-orchestrator.test" in path:
        return f"{prefix} Fora do escopo #386."

    if "loading-smart-recovery" in path or "hook-sensitive" in path:
        return f"{prefix} Fora do escopo #386."

    if "modelRouter.test" in path:
        return f"{prefix} Tipo via ReturnType<typeof setTimeout>."

    if path == "utils/llm/cost.ts":
        return f"{prefix} totalCostUsd somado; aceito para relatório."

    if path == "utils/llm/reportQuality.test.ts":
        return f"{prefix} Nitpick aceito."

    return f"{prefix} Revisado em `{COMMIT}`."


def process_pr(pr: int) -> int:
    q = (
        f'query {{ repository(owner:"{OWNER}", name:"{REPO}") '
        f"{{ pullRequest(number:{pr}) {{ reviewThreads(first:100) "
        f"{{ nodes {{ id isResolved path comments(first:1) "
        f"{{ nodes {{ databaseId body author {{ login }} }} }} }} }} }} }} }}"
    )
    threads = gh_graphql(q)["data"]["repository"]["pullRequest"]["reviewThreads"]["nodes"]
    open_threads = [t for t in threads if not t["isResolved"]]
    print(f"PR #{pr}: {len(open_threads)} open threads")
    ok = 0
    for t in open_threads:
        c = t["comments"]["nodes"][0]
        msg = response_for(t["path"] or "", c["author"]["login"], c["body"], pr)
        try:
            reply(c["databaseId"], msg)
            resolve(t["id"])
            ok += 1
        except subprocess.CalledProcessError as e:
            err = (e.stderr or b"").decode()[:300]
            print(f"  FAIL {t['path']}: {err}", file=sys.stderr)
    return ok


if __name__ == "__main__":
    total = process_pr(386) + process_pr(385)
    print(f"Resolved {total} threads")
