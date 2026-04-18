from __future__ import annotations

from dataclasses import dataclass, field


@dataclass(slots=True)
class MediaDescription:
    media: str
    port: int
    proto: str
    formats: list[str]
    attributes: dict[str, list[str]] = field(default_factory=dict)


@dataclass(slots=True)
class SessionDescription:
    version: str = "0"
    origin: str = "- 0 0 IN IP4 127.0.0.1"
    session_name: str = "SMURF Session"
    connection: str = "IN IP4 127.0.0.1"
    timing: str = "0 0"
    media: list[MediaDescription] = field(default_factory=list)

    def render(self) -> str:
        lines = [
            f"v={self.version}",
            f"o={self.origin}",
            f"s={self.session_name}",
            f"c={self.connection}",
            f"t={self.timing}",
        ]
        for media in self.media:
            lines.append(f"m={media.media} {media.port} {media.proto} {' '.join(media.formats)}")
            for key, values in media.attributes.items():
                if values:
                    for value in values:
                        lines.append(f"a={key}:{value}")
                else:
                    lines.append(f"a={key}")
        return "\r\n".join(lines) + "\r\n"


def parse_sdp(payload: str) -> SessionDescription:
    session = SessionDescription()
    current_media: MediaDescription | None = None
    for raw_line in payload.splitlines():
        line = raw_line.strip()
        if not line or "=" not in line:
            continue
        prefix, value = line[0], line[2:]
        if prefix == "v":
            session.version = value
        elif prefix == "o":
            session.origin = value
        elif prefix == "s":
            session.session_name = value
        elif prefix == "c":
            session.connection = value
        elif prefix == "t":
            session.timing = value
        elif prefix == "m":
            parts = value.split()
            current_media = MediaDescription(parts[0], int(parts[1]), parts[2], parts[3:])
            session.media.append(current_media)
        elif prefix == "a" and current_media is not None:
            if ":" in value:
                key, attr_value = value.split(":", 1)
                current_media.attributes.setdefault(key, []).append(attr_value)
            else:
                current_media.attributes.setdefault(value, [])
    return session
