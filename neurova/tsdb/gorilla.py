"""Gorilla compression for float64 time-series, built from scratch.

Reference: "Gorilla: A Fast, Scalable, In-Memory Time Series Database"
(Pelkonen et al., Facebook, VLDB 2015). We implement:
 * Delta-of-delta encoding on timestamps with a 4-bucket variable prefix.
 * XOR compression on double values with leading/trailing zero tracking.
 * A custom BitWriter/BitReader (no bitstring library) so the encoder has
   zero dependencies and we control every byte.
"""
from __future__ import annotations

import struct


class BitWriter:
    __slots__ = ("_bytes", "_bit_pos")

    def __init__(self) -> None:
        self._bytes = bytearray()
        self._bit_pos = 0  # bit position inside current last byte (0..7)

    def write_bit(self, v: int) -> None:
        if self._bit_pos == 0:
            self._bytes.append(0)
        if v:
            self._bytes[-1] |= 1 << (7 - self._bit_pos)
        self._bit_pos = (self._bit_pos + 1) & 7

    def write_bits(self, value: int, n: int) -> None:
        if n < 0:
            raise ValueError("n must be >= 0")
        if n == 0:
            return
        mask = 1 << (n - 1)
        for _ in range(n):
            self.write_bit(1 if value & mask else 0)
            mask >>= 1

    def to_bytes(self) -> bytes:
        return bytes(self._bytes)


class BitReader:
    __slots__ = ("_data", "_bit_pos", "_bit_len")

    def __init__(self, data: bytes, bit_len: int) -> None:
        self._data = data
        self._bit_pos = 0
        self._bit_len = bit_len

    def remaining(self) -> int:
        return self._bit_len - self._bit_pos

    def read_bit(self) -> int:
        if self._bit_pos >= self._bit_len:
            raise IndexError("out of bits")
        byte = self._data[self._bit_pos >> 3]
        bit = (byte >> (7 - (self._bit_pos & 7))) & 1
        self._bit_pos += 1
        return bit

    def read_bits(self, n: int) -> int:
        v = 0
        for _ in range(n):
            v = (v << 1) | self.read_bit()
        return v


def _zigzag(n: int) -> int:
    return (n << 1) ^ (n >> 63)


def _unzigzag(n: int) -> int:
    return (n >> 1) ^ -(n & 1)


class GorillaEncoder:
    """Encodes (timestamp_ms:int, value:float) pairs."""

    def __init__(self) -> None:
        self._w = BitWriter()
        self._count = 0
        self._first_ts = 0
        self._prev_ts = 0
        self._prev_delta = 0
        self._prev_value_bits = 0
        self._prev_leading = -1
        self._prev_trailing = 0

    def add(self, ts_ms: int, value: float) -> None:
        value_bits = struct.unpack(">Q", struct.pack(">d", float(value)))[0]
        if self._count == 0:
            self._first_ts = ts_ms
            self._w.write_bits(value_bits, 64)
            self._prev_ts = ts_ms
            self._prev_value_bits = value_bits
            self._count = 1
            return

        delta = ts_ms - self._prev_ts
        if self._count == 1:
            self._w.write_bits(_zigzag(delta) & ((1 << 32) - 1), 32)
        else:
            dod = delta - self._prev_delta
            self._encode_dod(dod)
        self._prev_delta = delta
        self._prev_ts = ts_ms

        xor = value_bits ^ self._prev_value_bits
        if xor == 0:
            self._w.write_bit(0)
        else:
            self._w.write_bit(1)
            leading = _clz64(xor)
            trailing = _ctz64(xor)
            if (
                self._prev_leading != -1
                and leading >= self._prev_leading
                and trailing >= self._prev_trailing
            ):
                self._w.write_bit(0)
                sig_bits = 64 - self._prev_leading - self._prev_trailing
                self._w.write_bits(xor >> self._prev_trailing, sig_bits)
            else:
                self._w.write_bit(1)
                if leading >= 32:
                    leading = 31
                sig_bits = 64 - leading - trailing
                self._w.write_bits(leading, 5)
                self._w.write_bits(sig_bits, 6)
                self._w.write_bits(xor >> trailing, sig_bits)
                self._prev_leading = leading
                self._prev_trailing = trailing
        self._prev_value_bits = value_bits
        self._count += 1

    def _encode_dod(self, dod: int) -> None:
        if dod == 0:
            self._w.write_bit(0)
        elif -63 <= dod <= 64:
            self._w.write_bits(0b10, 2)
            self._w.write_bits(dod & 0x7F, 7)
        elif -255 <= dod <= 256:
            self._w.write_bits(0b110, 3)
            self._w.write_bits(dod & 0x1FF, 9)
        elif -2047 <= dod <= 2048:
            self._w.write_bits(0b1110, 4)
            self._w.write_bits(dod & 0xFFF, 12)
        else:
            self._w.write_bits(0b1111, 4)
            self._w.write_bits(dod & 0xFFFFFFFF, 32)

    def finish(self) -> tuple[bytes, dict]:
        payload = self._w.to_bytes()
        header = {
            "count": self._count,
            "first_ts": self._first_ts,
            "bit_len": self._w._bit_pos + (len(payload) - 1) * 8 + (8 - ((-self._w._bit_pos) % 8)),
        }
        bit_len = (len(payload) - 1) * 8 + (self._w._bit_pos if self._w._bit_pos else 8)
        if self._count == 0:
            bit_len = 0
        header["bit_len"] = bit_len
        return payload, header


def _clz64(x: int) -> int:
    if x == 0:
        return 64
    n = 0
    mask = 1 << 63
    while x & mask == 0:
        n += 1
        mask >>= 1
    return n


def _ctz64(x: int) -> int:
    if x == 0:
        return 64
    n = 0
    while x & 1 == 0:
        n += 1
        x >>= 1
    return n


class GorillaDecoder:
    def __init__(self, payload: bytes, header: dict) -> None:
        self._r = BitReader(payload, header["bit_len"])
        self._count = header["count"]
        self._first_ts = header["first_ts"]

    def __iter__(self):
        r = self._r
        count = self._count
        if count == 0:
            return
        value_bits = r.read_bits(64)
        ts = self._first_ts
        yield ts, struct.unpack(">d", struct.pack(">Q", value_bits))[0]
        if count == 1:
            return
        delta = _unzigzag(r.read_bits(32))
        ts += delta
        value_bits = self._read_value(r, value_bits, first=True)
        yield ts, struct.unpack(">d", struct.pack(">Q", value_bits))[0]
        prev_leading = self._prev_leading
        prev_trailing = self._prev_trailing
        for _ in range(count - 2):
            dod = self._read_dod(r)
            delta += dod
            ts += delta
            b = r.read_bit()
            if b == 0:
                pass
            else:
                b2 = r.read_bit()
                if b2 == 1:
                    leading = r.read_bits(5)
                    sig = r.read_bits(6)
                    if sig == 0:
                        sig = 64
                    trailing = 64 - leading - sig
                    prev_leading = leading
                    prev_trailing = trailing
                else:
                    sig = 64 - prev_leading - prev_trailing
                xor = r.read_bits(sig) << prev_trailing
                value_bits ^= xor
            yield ts, struct.unpack(">d", struct.pack(">Q", value_bits))[0]

    def _read_value(self, r: BitReader, prev_bits: int, first: bool = False) -> int:
        b = r.read_bit()
        if b == 0:
            self._prev_leading = -1
            self._prev_trailing = 0
            return prev_bits
        b2 = r.read_bit()
        if b2 == 1:
            leading = r.read_bits(5)
            sig = r.read_bits(6)
            if sig == 0:
                sig = 64
            trailing = 64 - leading - sig
        else:
            leading = self._prev_leading if self._prev_leading != -1 else 0
            trailing = self._prev_trailing
            sig = 64 - leading - trailing
        xor = r.read_bits(sig) << trailing
        self._prev_leading = leading
        self._prev_trailing = trailing
        return prev_bits ^ xor

    def _read_dod(self, r: BitReader) -> int:
        b = r.read_bit()
        if b == 0:
            return 0
        b = r.read_bit()
        if b == 0:
            raw = r.read_bits(7)
            if raw & 0x40:
                raw -= 0x80
            return raw
        b = r.read_bit()
        if b == 0:
            raw = r.read_bits(9)
            if raw & 0x100:
                raw -= 0x200
            return raw
        b = r.read_bit()
        if b == 0:
            raw = r.read_bits(12)
            if raw & 0x800:
                raw -= 0x1000
            return raw
        raw = r.read_bits(32)
        if raw & 0x80000000:
            raw -= 0x100000000
        return raw


def delta_delta_encode(values: list[int]) -> bytes:
    """Delta-of-delta encoding for monotonically increasing integer series."""
    if not values:
        return b""
    out = bytearray()
    out += struct.pack(">q", values[0])
    if len(values) == 1:
        return bytes(out)
    prev = values[0]
    prev_delta = 0
    for v in values[1:]:
        delta = v - prev
        dod = delta - prev_delta
        _write_zigzag_varint(out, dod)
        prev = v
        prev_delta = delta
    return bytes(out)


def delta_delta_decode(blob: bytes, count: int) -> list[int]:
    if count == 0:
        return []
    (first,) = struct.unpack_from(">q", blob, 0)
    out = [first]
    if count == 1:
        return out
    pos = 8
    prev_delta = 0
    prev = first
    for _ in range(count - 1):
        dod, used = _read_zigzag_varint(blob, pos)
        pos += used
        prev_delta += dod
        prev += prev_delta
        out.append(prev)
    return out


def _write_zigzag_varint(buf: bytearray, value: int) -> None:
    z = (value << 1) ^ (value >> 63)
    z &= 0xFFFFFFFFFFFFFFFF
    while True:
        b = z & 0x7F
        z >>= 7
        if z:
            buf.append(b | 0x80)
        else:
            buf.append(b)
            return


def _read_zigzag_varint(blob: bytes, pos: int) -> tuple[int, int]:
    shift = 0
    value = 0
    start = pos
    while True:
        b = blob[pos]
        pos += 1
        value |= (b & 0x7F) << shift
        if b & 0x80 == 0:
            break
        shift += 7
    decoded = (value >> 1) ^ -(value & 1)
    return decoded, pos - start
