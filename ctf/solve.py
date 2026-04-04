#!/usr/bin/env python3
"""
Solver for Hook My Secret CTF challenge (3 stages)
"""
import hashlib
import base64
from Crypto.Cipher import AES

def rol8(v, n):
    v &= 0xFF
    return ((v << n) | (v >> (8 - n))) & 0xFF

def ror8(v, n):
    v &= 0xFF
    return ((v >> n) | (v << (8 - n))) & 0xFF

def encrypt_stage2(input_bytes):
    """Forward encryption - emulate the native encryptStage2 function"""
    carry = 0x51
    output = []
    for i in range(len(input_bytes)):
        b = input_bytes[i]
        val = ((13 * i + 0x42) ^ carry ^ b) & 0xFF
        val = rol8(val, 3)
        out = (7 * carry + i + val) & 0xFF
        output.append(out)
        carry = (b + carry + (out ^ i)) & 0xFF
    return output

def decrypt_stage2(target):
    """Reverse the native encryptStage2 function"""
    carry = 0x51
    result = []
    for i in range(len(target)):
        val = (target[i] - 7 * carry - i) & 0xFF
        pre = ror8(val, 3)
        input_byte = pre ^ ((13 * i + 0x42) & 0xFF) ^ (carry & 0xFF)
        result.append(input_byte)
        carry = (input_byte + carry + (target[i] ^ i)) & 0xFF
    return bytes(result)

print("=" * 60)
print("STAGE 1: Pattern Lock")
print("=" * 60)
pattern = "0,1,2,4,8"
h = hashlib.sha256(pattern.encode("utf-8")).hexdigest()
target_hash = "4a6bc34076c8eef0f9eac59ad30d99bb4f56ecea4b0bfab92540fb655ac680f3"
print(f"Pattern: {pattern}")
print(f"Hash match: {h == target_hash}")

print()
print("=" * 60)
print("STAGE 2: Native Encryption")
print("=" * 60)
target_output = [250, 113, 87, 185, 6, 125, 167, 156, 4, 0, 229, 239, 119, 155, 187, 95]
stage2_input = decrypt_stage2(target_output)
print(f"Stage 2 input (raw bytes): {stage2_input}")
print(f"Stage 2 input (string): {stage2_input.decode('utf-8', errors='replace')}")

verification = encrypt_stage2(list(stage2_input))
print(f"Verification: {verification}")
print(f"Match: {verification == target_output}")

print()
print("=" * 60)
print("STAGE 3: AES Decryption")
print("=" * 60)

stage2_key_raw = stage2_input.decode('utf-8', errors='replace').strip()
print(f"Stage 2 key (trimmed): '{stage2_key_raw}'")

stage2_key_cleaned = stage2_key_raw.replace("-", "")
print(f"Stage 2 key (no dashes): '{stage2_key_cleaned}'")
key_bytes = stage2_key_cleaned.encode('utf-8')
print(f"Key length: {len(key_bytes)}")
print(f"Key bytes: {key_bytes.hex()}")

iv_b64 = "VmVyaWZ5VmVjdG9yMTIzNA=="
iv = base64.b64decode(iv_b64)
print(f"IV: {iv}")
print(f"IV length: {len(iv)}")

ciphertext_b64 = "jSaMnziall55Tdr+IZc7EKUNm/N4uwrZw1QFPw6DuirfYFJZg88j6GKLhWfNljAB"
ciphertext = base64.b64decode(ciphertext_b64)
print(f"Ciphertext length: {len(ciphertext)}")

if len(key_bytes) in (16, 24, 32):
    cipher = AES.new(key_bytes, AES.MODE_CBC, iv)
    plaintext = cipher.decrypt(ciphertext)
    print(f"Decrypted (raw): {plaintext}")
    try:
        pad_len = plaintext[-1]
        if 1 <= pad_len <= 16 and all(b == pad_len for b in plaintext[-pad_len:]):
            plaintext_unpadded = plaintext[:-pad_len]
            print(f"Decrypted (unpadded): {plaintext_unpadded}")
            print(f"FLAG: {plaintext_unpadded.decode('utf-8')}")
        else:
            print(f"Decrypted (as string): {plaintext.decode('utf-8', errors='replace')}")
    except Exception as e:
        print(f"Error: {e}")
        print(f"Decrypted (as string): {plaintext.decode('utf-8', errors='replace')}")
else:
    print(f"ERROR: Key length {len(key_bytes)} is not 16, 24, or 32!")
    print("Trying different interpretations...")
    for kl in [16, 24, 32]:
        if len(key_bytes) >= kl:
            k = key_bytes[:kl]
            try:
                cipher = AES.new(k, AES.MODE_CBC, iv)
                plaintext = cipher.decrypt(ciphertext)
                pad_len = plaintext[-1]
                if 1 <= pad_len <= 16 and all(b == pad_len for b in plaintext[-pad_len:]):
                    plaintext_unpadded = plaintext[:-pad_len]
                    print(f"Key length {kl}: {plaintext_unpadded.decode('utf-8')}")
            except:
                pass
