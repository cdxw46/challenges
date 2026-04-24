"""Dictionary coder (LZ77 family) built from scratch for NEUROVA.

Wire format (little-endian):
    magic[4]          = b'NVZ1'
    uncompressed[4]   = size of the original payload
    stream            = sequence of tokens until terminator:
        lit_len       varint (can be 0)
        lit_bytes     lit_len bytes
        match_off     varint (0 marks end-of-stream)
        match_len     varint (present only if match_off != 0, encoded as
                             length - MIN_MATCH so it fits in 1 byte when
                             the match is short)

The encoder uses a rolling 4-byte hash and a single-entry head table with
chained predecessors for fast candidate lookup; the decoder is a simple
memcpy loop and refuses any corrupt frame.
"""

from __future__ import annotations

import struct

MAGIC = b"NVZ1"
WINDOW = 1 << 16
MIN_MATCH = 4
MAX_MATCH = 1 << 16
HASH_BITS = 16
HASH_SIZE = 1 << HASH_BITS


def _hash4(data: bytes, pos: int) -> int:
    x = data[pos] | (data[pos + 1] << 8) | (data[pos + 2] << 16) | (data[pos + 3] << 24)
    return ((x * 2654435761) >> (32 - HASH_BITS)) & (HASH_SIZE - 1)


def _put_varint(buf: bytearray, n: int) -> None:
    if n < 0:
        raise ValueError("varint must be non-negative")
    while True:
        byte = n & 0x7F
        n >>= 7
        if n:
            buf.append(byte | 0x80)
        else:
            buf.append(byte)
            return


def _get_varint(data: bytes, pos: int) -> tuple[int, int]:
    shift = 0
    value = 0
    idx = pos
    n = len(data)
    while True:
        if idx >= n:
            raise ValueError("truncated varint")
        b = data[idx]
        idx += 1
        value |= (b & 0x7F) << shift
        if b & 0x80 == 0:
            break
        shift += 7
        if shift > 63:
            raise ValueError("varint too long")
    return value, idx - pos


def compress(data: bytes) -> bytes:
    out = bytearray(MAGIC)
    out += struct.pack("<I", len(data))
    if not data:
        _put_varint(out, 0)
        _put_varint(out, 0)
        return bytes(out)

    n = len(data)
    head = [-1] * HASH_SIZE
    prev = [-1] * n
    i = 0
    literal_start = 0

    while i < n - MIN_MATCH:
        h = _hash4(data, i)
        cand = head[h]
        best_off = 0
        best_len = 0
        chain = 32
        while cand != -1 and (i - cand) < WINDOW and chain > 0:
            if best_len == 0 or data[cand + best_len] == data[i + best_len]:
                length = 0
                while (
                    length < MAX_MATCH
                    and i + length < n
                    and data[cand + length] == data[i + length]
                ):
                    length += 1
                if length > best_len:
                    best_len = length
                    best_off = i - cand
                    if length >= MAX_MATCH:
                        break
            cand = prev[cand]
            chain -= 1
        if best_len >= MIN_MATCH:
            lit_len = i - literal_start
            _put_varint(out, lit_len)
            out += data[literal_start:i]
            _put_varint(out, best_off)
            _put_varint(out, best_len - MIN_MATCH)
            for j in range(best_len):
                pos = i + j
                if pos + 4 <= n:
                    hh = _hash4(data, pos)
                    prev[pos] = head[hh]
                    head[hh] = pos
            i += best_len
            literal_start = i
        else:
            prev[i] = head[h]
            head[h] = i
            i += 1

    lit_len = n - literal_start
    _put_varint(out, lit_len)
    out += data[literal_start:]
    _put_varint(out, 0)
    return bytes(out)


def decompress(blob: bytes) -> bytes:
    if blob[:4] != MAGIC:
        raise ValueError("not an NVZ1 stream")
    size = struct.unpack_from("<I", blob, 4)[0]
    out = bytearray()
    p = 8
    while p < len(blob):
        lit_len, used = _get_varint(blob, p)
        p += used
        if lit_len:
            if p + lit_len > len(blob):
                raise ValueError("truncated literal")
            out += blob[p : p + lit_len]
            p += lit_len
        off, used = _get_varint(blob, p)
        p += used
        if off == 0:
            break
        match_ex, used = _get_varint(blob, p)
        p += used
        match_len = match_ex + MIN_MATCH
        if off > len(out):
            raise ValueError("bad match offset")
        src = len(out) - off
        for _ in range(match_len):
            out.append(out[src])
            src += 1
    if len(out) != size:
        raise ValueError(f"size mismatch {len(out)} != {size}")
    return bytes(out)
