"""Conference rooms — sum-mix N participants and feed each one (mix - their own).

This is the classic conference algorithm: every participant hears the sum
of every other participant.  Audio is processed at 8 kHz mono linear PCM
inside the bridge; the per-participant ``RTPSession`` handles encode/decode
to whatever codec was negotiated with the phone.
"""

from __future__ import annotations

import asyncio
import audioop
import time
from dataclasses import dataclass, field
from typing import Optional

from ..core.eventbus import BUS
from ..core.log import get_logger
from ..rtp.session import RTPSession

log = get_logger("smurf.pbx.conf")
SAMPLES_PER_FRAME = 160
FRAME_BYTES = SAMPLES_PER_FRAME * 2


@dataclass
class Participant:
    extension: str
    call_id: str
    rtp: RTPSession
    last_pcm: bytes = b""
    joined_at: float = field(default_factory=time.time)
    leave_event: asyncio.Event = field(default_factory=asyncio.Event)


class Room:
    def __init__(self, number: str) -> None:
        self.number = number
        self.parts: list[Participant] = []
        self._task: Optional[asyncio.Task] = None
        self._lock = asyncio.Lock()
        self._stop = asyncio.Event()

    def start_if_needed(self) -> None:
        if self._task is None or self._task.done():
            self._task = asyncio.create_task(self._mixer())

    async def add(self, p: Participant) -> None:
        async with self._lock:
            self.parts.append(p)
        BUS.publish("conf.join", {"room": self.number, "ext": p.extension, "n": len(self.parts)})

    async def remove(self, p: Participant) -> None:
        async with self._lock:
            if p in self.parts:
                self.parts.remove(p)
        p.leave_event.set()
        BUS.publish("conf.leave", {"room": self.number, "ext": p.extension, "n": len(self.parts)})

    async def _mixer(self) -> None:
        loop = asyncio.get_running_loop()
        period = 0.02
        next_tick = loop.time()
        silence = b"\x00\x00" * SAMPLES_PER_FRAME
        while not self._stop.is_set():
            await asyncio.sleep(max(0, next_tick - loop.time()))
            next_tick += period
            async with self._lock:
                parts = list(self.parts)
            if not parts:
                if not self.parts:
                    await asyncio.sleep(0.5)
                continue
            # Drain one frame from each participant's recv queue.
            frames: dict[int, bytes] = {}
            for i, p in enumerate(parts):
                try:
                    fr = p.rtp.recv_queue.get_nowait()
                except asyncio.QueueEmpty:
                    fr = silence
                if len(fr) < FRAME_BYTES:
                    fr = fr + b"\x00" * (FRAME_BYTES - len(fr))
                elif len(fr) > FRAME_BYTES:
                    fr = fr[:FRAME_BYTES]
                frames[i] = fr
                p.last_pcm = fr
            # Mix
            mix = silence
            for fr in frames.values():
                mix = audioop.add(mix, fr, 2)
            for i, p in enumerate(parts):
                self_fr = frames.get(i, silence)
                # mix - this participant's own audio
                outbound = audioop.add(mix, audioop.mul(self_fr, 2, -1.0), 2)
                await p.rtp.send_pcm(outbound)


class ConferenceManager:
    def __init__(self) -> None:
        self.rooms: dict[str, Room] = {}

    def get_room(self, number: str) -> Room:
        room = self.rooms.get(number)
        if room is None:
            room = Room(number)
            self.rooms[number] = room
        room.start_if_needed()
        return room

    async def join(self, room_number: str, rtp: RTPSession, extension: str, call_id: str) -> None:
        room = self.get_room(room_number)
        part = Participant(extension=extension, call_id=call_id, rtp=rtp)
        await room.add(part)
        try:
            await part.leave_event.wait()
        except asyncio.CancelledError:
            await room.remove(part)
            raise

    async def kick(self, room_number: str, extension: str) -> int:
        room = self.rooms.get(room_number)
        if not room:
            return 0
        kicked = 0
        for p in list(room.parts):
            if p.extension == extension:
                await room.remove(p)
                kicked += 1
        return kicked
