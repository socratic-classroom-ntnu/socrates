"""Gemini Live over its WebSocket API, opened by the backend only (the key never leaves it).

One session per call to ``open_session``: the system instruction is sent in the setup message,
before any student audio. Audio in is 16 kHz PCM16; audio out is PCM16 as Gemini sends it
(24 kHz). Both sides' transcripts are turned on; they are what the solo dialogue stores.
"""

from __future__ import annotations

import base64
import json
from collections.abc import AsyncIterator
from dataclasses import dataclass
from typing import Any, Literal

import websockets

from app.modules.platform.config import settings

URL = (
    "wss://generativelanguage.googleapis.com/ws/"
    "google.ai.generativelanguage.v1beta.GenerativeService.BidiGenerateContent"
)
INPUT_MIME = "audio/pcm;rate=16000"
# What speech recognition listens for, per student locale. Mandarin is only offered in simplified
# characters (cmn-Hans-CN); the solo dialogue converts transcripts to the student's script itself.
LANGUAGE_CODES = {"zh-Hant": "cmn-Hans-CN", "zh-Hans": "cmn-Hans-CN", "en": "en-US", "es": "es-ES"}

EventKind = Literal["audio", "input_text", "output_text", "turn_complete", "interrupted"]


@dataclass(frozen=True)
class LiveEvent:
    """One thing the voice model sent: audio, a piece of either transcript, or a turn marker."""

    kind: EventKind
    data: bytes | str = b""


class GeminiLiveSession:
    def __init__(self, ws: Any) -> None:
        self.ws = ws
        # The last usage Gemini reported (token counts), for the cost readback.
        self.usage: dict[str, Any] = {}

    async def send_audio(self, pcm: bytes) -> None:
        data = base64.b64encode(pcm).decode()
        await self.ws.send(
            json.dumps({"realtimeInput": {"audio": {"data": data, "mimeType": INPUT_MIME}}})
        )

    async def send_text(self, text: str) -> None:
        turn = {"turns": [{"role": "user", "parts": [{"text": text}]}], "turnComplete": True}
        await self.ws.send(json.dumps({"clientContent": turn}))

    async def events(self) -> AsyncIterator[LiveEvent]:
        async for raw in self.ws:
            message = json.loads(raw)
            if "usageMetadata" in message:
                self.usage = message["usageMetadata"]
            content = message.get("serverContent")
            if not content:
                continue
            if "inputTranscription" in content:
                yield LiveEvent("input_text", content["inputTranscription"].get("text", ""))
            for part in (content.get("modelTurn") or {}).get("parts", []):
                inline = part.get("inlineData") or {}
                if inline.get("data"):
                    yield LiveEvent("audio", base64.b64decode(inline["data"]))
            if "outputTranscription" in content:
                yield LiveEvent("output_text", content["outputTranscription"].get("text", ""))
            if content.get("interrupted"):
                yield LiveEvent("interrupted")
            if content.get("turnComplete"):
                yield LiveEvent("turn_complete")

    async def close(self) -> None:
        await self.ws.close()


async def open_session(instruction: str, locale: str) -> GeminiLiveSession:
    key = settings.voice_gemini_api_key.strip()
    if not key:
        raise RuntimeError("VOICE_KEY_MISSING")
    ws = await websockets.connect(f"{URL}?key={key}", max_size=None)
    setup = {
        "model": f"models/{settings.voice_model}",
        "generationConfig": {
            "responseModalities": ["AUDIO"],
            "speechConfig": {
                "voiceConfig": {"prebuiltVoiceConfig": {"voiceName": settings.voice_name}}
            },
        },
        "systemInstruction": {"parts": [{"text": instruction}]},
        "inputAudioTranscription": {"languageCodes": [LANGUAGE_CODES.get(locale, "cmn-Hans-CN")]},
        "outputAudioTranscription": {},
    }
    await ws.send(json.dumps({"setup": setup}))
    while True:
        message = json.loads(await ws.recv())
        if "setupComplete" in message:
            return GeminiLiveSession(ws)
