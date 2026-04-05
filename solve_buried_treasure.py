"""
CTF: RITSEC - Buried Treasure
Hint: "I buried the flag pretty deep, can you dig it back up?"

The binary is a TinyGo-compiled matryoshka: 15 nested ELF layers.
Each layer creates a memfd, writes the next ELF, and execve's it.
The innermost layer (9656 bytes) validates the flag.

Validation logic (at 0x203029 in the final layer):
  For each character i (0-indexed) of the 36-char input:
    input[i] * 13*(i+1) + (38+i) == table[38+i]
  where table is at virtual address 0x200168.

Solution: extract final layer via strace, read the lookup table,
and solve the linear equation for each character.

Flag: RS{0k4y_i_th1nk_th47s_3n0ugh_l4y3rs}
"""

import struct
import subprocess
import re
import os


def extract_final_layer(binary_path):
    """Extract the innermost ELF by running under strace."""
    result = subprocess.run(
        ['strace', '-e', 'write=5', '-e', 'trace=write', binary_path],
        input=b'AAAA\n', capture_output=True, timeout=10
    )
    content = result.stderr.decode('latin-1')

    writes = content.split('write(5,')
    layers = []
    for w in writes[1:]:
        size_match = re.search(r',\s*(\d+)\)\s*=\s*\d+', w)
        if not size_match:
            continue
        size = int(size_match.group(1))
        hex_lines = re.findall(r'\|\s+[0-9a-f]+\s+((?:[0-9a-f]{2}\s+)+)', w)
        raw_bytes = bytearray()
        for hl in hex_lines:
            for hv in hl.strip().split():
                raw_bytes.append(int(hv, 16))
        if len(raw_bytes) >= size:
            layers.append(raw_bytes[:size])

    return bytes(layers[-1]) if layers else None


def solve_flag(elf_data):
    """Solve the flag from the final layer's validation table."""
    flag = ""
    for i in range(36):
        idx = 0x26 + i
        offset = 0x168 + idx * 8
        table_val = struct.unpack_from('<Q', elf_data, offset)[0]
        multiplier = 0x0d * (i + 1)
        char_code = (table_val - (0x26 + i)) // multiplier
        flag += chr(char_code)
    return flag


if __name__ == "__main__":
    if os.path.exists('layer_final.elf'):
        elf_data = open('layer_final.elf', 'rb').read()
    else:
        print("Extracting final layer from buried_treasure...")
        elf_data = extract_final_layer('./buried_treasure')
        if elf_data is None:
            print("Failed to extract. Make sure strace is installed.")
            exit(1)
        with open('layer_final.elf', 'wb') as f:
            f.write(elf_data)

    flag = solve_flag(elf_data)
    print(f"Flag: {flag}")
