"""One OpenRouter stream per logical tutor call. Secrets stay in backend environment."""

import json
import os
import re
import time
from uuid import uuid4
import httpx
from .contracts import TutorTurn, Observations


class ProviderWait(RuntimeError):
    def __init__(self, reason, seconds=60):
        self.reason, self.seconds = reason, seconds
        super().__init__(reason)


def partial_reply(raw):
    match = re.search(r'"reply_text"\s*:\s*"', raw)
    if not match:
        return ""
    data = raw[match.end() :]
    out = []
    i = 0
    while i < len(data):
        c = data[i]
        if c == '"':
            break
        if c == "\\":
            if i + 1 >= len(data):
                break
            c = data[i + 1]
            i += 1
            if c == "u":
                if i + 4 >= len(data):
                    break
                try:
                    out.append(chr(int(data[i + 1 : i + 5], 16)))
                except ValueError:
                    break
                i += 5
                continue
            out.append({"n": "\n", "r": "\r", "t": "\t", "b": "\b", "f": "\f"}.get(c, c))
        else:
            out.append(c)
        i += 1
    # Partial UTF-16 pairs may arrive in different chunks.
    return "".join(out).encode("utf-16", "surrogatepass").decode("utf-16", "replace")


def fallback(context):
    hints = context["question"].get("probe_hints") or ["你如何描述這個選擇背後的原則？"]
    turn = context.get("turn_index", 0)
    text = hints[min(turn, len(hints) - 1)]
    argument = context.get("argument", "")
    return TutorTurn(
        reply_text=text,
        observations=Observations(
            has_position=True, has_reason=bool(argument), reason_tested=False
        ),
        move="probe",
        micro_summary="本次討論從此理由展開：" + argument[:300],
    ).model_dump()


class OpenRouterProvider:
    async def generate(self, messages, schema, on_delta):
        key = os.environ.get("OPENROUTER_API_KEY", "")
        if not key:
            raise ProviderWait("OPENROUTER_KEY_BINDING", 60)
        started = time.monotonic()
        request_id = str(uuid4())
        body = {
            "model": "openrouter/free",
            "messages": messages,
            "stream": True,
            "max_tokens": int(os.environ.get("RUN2_MAX_OUTPUT_TOKENS", "2048")),
            "response_format": {
                "type": "json_schema",
                "json_schema": {
                    "name": schema.__name__,
                    "strict": True,
                    "schema": schema.model_json_schema(),
                },
            },
            "provider": {"require_parameters": True},
        }
        headers = {
            "Authorization": "Bearer " + key,
            "Content-Type": "application/json",
            "X-Title": "Socrates Run2",
            "HTTP-Referer": os.environ.get("SOCRATES_PUBLIC_ORIGIN", "http://localhost"),
            "X-Request-ID": request_id,
        }
        raw = ""
        shown = ""
        usage = {}
        model = None
        remote_id = None
        async with httpx.AsyncClient(timeout=httpx.Timeout(45, connect=10)) as client:
            async with client.stream(
                "POST", "https://openrouter.ai/api/v1/chat/completions", json=body, headers=headers
            ) as r:
                if r.status_code in {402, 429, 503}:
                    try:
                        delay = float(r.headers.get("retry-after", "60"))
                    except ValueError:
                        delay = 60
                    raise ProviderWait("PROVIDER_AVAILABILITY", max(1, min(delay, 3600)))
                r.raise_for_status()
                async for line in r.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    payload = line[5:].strip()
                    if payload == "[DONE]":
                        break
                    try:
                        obj = json.loads(payload)
                    except ValueError:
                        continue
                    if "error" in obj:
                        raise ProviderWait("PROVIDER_STREAM_INTERRUPTED", 30)
                    remote_id = obj.get("id", remote_id)
                    model = obj.get("model", model)
                    usage = obj.get("usage") or usage
                    for choice in obj.get("choices", []):
                        chunk = choice.get("delta", {}).get("content") or ""
                        raw += chunk
                        if len(raw) > 100000:
                            raise ProviderWait("OUTPUT_CONTRACT_SIZE", 60)
                    current = partial_reply(raw)
                    if current.startswith(shown) and len(current) > len(shown):
                        await on_delta(current[len(shown) :])
                        shown = current
        result = schema.model_validate_json(raw).model_dump()
        return result, {
            "provider": "openrouter",
            "actual_model": model,
            "request_id": remote_id or request_id,
            "client_request_id": request_id,
            "latency_ms": round((time.monotonic() - started) * 1000),
            "token_usage": usage,
            "fallback_used": False,
        }
