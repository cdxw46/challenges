from __future__ import annotations

import asyncio
import signal
from pathlib import Path

from .pbx import PbxEngine
from .web import WebApp


async def run() -> None:
    root = Path(__file__).resolve().parents[2]
    engine = await PbxEngine.build(root)
    web = WebApp(engine)
    await engine.start()
    await web.start()

    stop_event = asyncio.Event()

    def _stop() -> None:
        stop_event.set()

    loop = asyncio.get_running_loop()
    for sig in (signal.SIGINT, signal.SIGTERM):
        loop.add_signal_handler(sig, _stop)

    await stop_event.wait()
    await web.stop()
    await engine.stop()


def main() -> None:
    asyncio.run(run())


if __name__ == "__main__":
    main()
