import socket
import json
import hashlib
from Crypto.Cipher import AES

PARAMS_FILE = 'params.json'

with open(PARAMS_FILE) as f:
    raw = json.load(f)

p = int(raw["p"])
primes = [int(x) for x in raw["primes"]]
n = len(primes)  # 74
base_A = int(raw["base_curve_A"])
iso_challenge_A = int(raw["iso_challenge_A"])
gr48_poly = [int(x) for x in raw["gr48_poly"]]
gr48_gen = [int(x) for x in raw["gr48_generator"]]
flag_ct = bytes.fromhex(raw["flag_ct"])
flag_nonce = bytes.fromhex(raw["flag_nonce"])
flag_tag = bytes.fromhex(raw["flag_tag"])

HOST = "portobelo.ctf.ritsec.club"
PORT = 1337

def recv_line(s):
    buf = b""
    while True:
        c = s.recv(1)
        if not c or c == b"\n":
            return buf.decode().strip()
        buf += c

def connect_and_query(points):
    """Connect and send multiple QUERY commands, return list of (query_A, trace_val)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(30)
    s.connect((HOST, PORT))
    
    banner = recv_line(s)
    print(f"  Banner: {banner}")
    params_line = recv_line(s)
    flag_line = recv_line(s)
    ready = recv_line(s)
    print(f"  Ready: {ready}")
    
    results = []
    ops_count = None
    for i, pt in enumerate(points):
        cmd = f"QUERY {pt}\n"
        s.sendall(cmd.encode())
        resp = recv_line(s)
        if resp.startswith("RESULT"):
            parts = resp.split()
            j_inv = int(parts[1])
            oc = int(parts[2])
            trace_val = int(parts[3])
            if ops_count is None:
                ops_count = oc
            results.append((pt, trace_val))
            if (i+1) % 10 == 0:
                print(f"  Query {i+1}/{len(points)} completada")
        else:
            print(f"  Error en query {pt}: {resp}")
    
    s.sendall(b"QUIT\n")
    s.close()
    return results, ops_count

print(f"[*] p tiene {p.bit_length()} bits, {n} primos")
print(f"[*] Necesitamos al menos {n} evaluaciones para interpolar")

eval_points = list(range(3, 3 + n + 2))
print(f"[*] Consultando {len(eval_points)} puntos al servidor...")
results, ops_count = connect_and_query(eval_points)
print(f"[*] ops_count = {ops_count}")
print(f"[*] Obtuvimos {len(results)} evaluaciones")

xs = [r[0] for r in results]
ys = [r[1] for r in results]

print("[*] Interpolando polinomio mod p...")

def modinv(a, m):
    return pow(a % m, m - 2, m)

def lagrange_interpolate(xs, ys, mod):
    """Lagrange interpolation mod prime, returns list of coefficients."""
    n_pts = len(xs)
    coeffs = [0] * n_pts
    
    for i in range(n_pts):
        basis = [0] * n_pts
        basis[0] = 1
        
        denom = 1
        deg = 0
        for j in range(n_pts):
            if i == j:
                continue
            denom = denom * ((xs[i] - xs[j]) % mod) % mod
            new_basis = [0] * n_pts
            for k in range(deg + 1):
                new_basis[k + 1] = (new_basis[k + 1] + basis[k]) % mod
                new_basis[k] = (new_basis[k] - basis[k] * xs[j]) % mod
            basis = new_basis
            deg += 1
        
        inv_denom = modinv(denom, mod)
        scale = ys[i] * inv_denom % mod
        for k in range(n_pts):
            coeffs[k] = (coeffs[k] + scale * basis[k]) % mod
    
    return coeffs

num_for_interp = n
coeffs = lagrange_interpolate(xs[:num_for_interp], ys[:num_for_interp], p)

print(f"[*] Interpolación completada, {len(coeffs)} coeficientes")

recovered_sk = []
for i in range(n):
    c = coeffs[i] % p
    if c > p // 2:
        c = c - p
    recovered_sk.append(c)

print(f"[*] Clave recuperada (sin poisoned): {recovered_sk}")

observed_ops = sum(abs(x) for x in recovered_sk)
print(f"[*] ops_count del servidor = {ops_count}")
print(f"[*] ops observadas = {observed_ops}")
missing_abs = ops_count - observed_ops
print(f"[*] Valor absoluto faltante = {missing_abs}")

zero_indices = [i for i in range(n) if recovered_sk[i] == 0]
print(f"[*] Índices con coeficiente 0: {zero_indices}")

if missing_abs == 0:
    print("[*] No falta ningún valor, la clave está completa")
    secret_key = recovered_sk
    poisoned_index = -1
else:
    candidates = [i for i in range(n) if recovered_sk[i] == 0]
    print(f"[*] Posibles índices envenenados: {candidates}")
    
    for pi in candidates:
        for sign in [1, -1]:
            test_key = list(recovered_sk)
            test_key[pi] = sign * missing_abs
            
            test_ops = sum(abs(x) for x in test_key)
            if test_ops != ops_count:
                continue
            
            verify_A = xs[0]
            verify_trace = 0
            A_pow = 1
            for i in range(n):
                if i != pi:
                    verify_trace = (verify_trace + test_key[i] * A_pow) % p
                A_pow = A_pow * verify_A % p
            
            if verify_trace == ys[0]:
                print(f"[+] Encontrado: poisoned_index = {pi}, sk[{pi}] = {sign * missing_abs}")
                secret_key = test_key
                poisoned_index = pi
                break
        else:
            continue
        break
    else:
        print("[!] No se encontró candidato simple.")
        print("[*] Probando todos los índices con todas las magnitudes...")
        found = False
        for pi in range(n):
            for val in range(-10, 11):
                if val == 0 and recovered_sk[pi] != 0:
                    continue
                test_key = list(recovered_sk)
                test_key[pi] = val if recovered_sk[pi] == 0 else recovered_sk[pi]
                
                if pi < len(candidates) and recovered_sk[pi] == 0:
                    test_key[pi] = val
                else:
                    continue
                    
                test_ops = sum(abs(x) for x in test_key)
                if test_ops != ops_count:
                    continue
                
                verify_A = xs[0]
                verify_trace = 0
                A_pow = 1
                for i in range(n):
                    if i != pi:
                        verify_trace = (verify_trace + test_key[i] * A_pow) % p
                    A_pow = A_pow * verify_A % p
                
                if verify_trace == ys[0]:
                    print(f"[+] Encontrado: poisoned_index = {pi}, sk[{pi}] = {val}")
                    secret_key = test_key
                    poisoned_index = pi
                    found = True
                    break
            if found:
                break
        if not found:
            print("[-] No se pudo determinar el índice envenenado")
            exit(1)

print(f"[*] Clave secreta completa: {secret_key}")

def mul_gr48(a, b, poly):
    deg = 8
    prod = [0] * (2 * deg - 1)
    for i in range(deg):
        for j in range(deg):
            prod[i + j] = (prod[i + j] + a[i] * b[j]) % 4
    for d in range(2 * deg - 2, deg - 1, -1):
        if prod[d] != 0:
            coeff = prod[d]
            for k in range(deg + 1):
                prod[d - deg + k] = (prod[d - deg + k] - coeff * poly[k]) % 4
            prod[d] = 0
    return prod[:deg]

def kdf(secret_key, poly_coeffs, gen_coeffs):
    sk_bytes = bytes([e + 127 for e in secret_key])
    h = hashlib.shake_256(sk_bytes)
    state_bytes = h.digest(136)
    mixed = bytearray()
    for off in range(0, len(state_bytes), 8):
        block = state_bytes[off:off + 8]
        if len(block) < 8:
            block = block + bytes(8 - len(block))
        elem = [int(b) % 4 for b in block]
        product = mul_gr48(elem, gen_coeffs, poly_coeffs)
        mixed.extend(bytes(c % 256 for c in product))
    squeeze = h.digest(32)
    derived = hashlib.shake_256(bytes(mixed)).digest(32)
    return bytes(a ^ b for a, b in zip(derived, squeeze))

print("[*] Derivando clave AES con KDF...")
aes_key = kdf(secret_key, gr48_poly, gr48_gen)
print(f"[*] Clave AES: {aes_key.hex()}")

print("[*] Descifrando flag...")
try:
    cipher = AES.new(aes_key, AES.MODE_GCM, nonce=flag_nonce)
    plaintext = cipher.decrypt_and_verify(flag_ct, flag_tag)
    print(f"\n[+] FLAG: {plaintext.decode()}")
except Exception as e:
    print(f"[-] Error al descifrar: {e}")
    print("[*] Probando con la clave negada...")
    neg_key = [-x for x in secret_key]
    aes_key2 = kdf(neg_key, gr48_poly, gr48_gen)
    try:
        cipher2 = AES.new(aes_key2, AES.MODE_GCM, nonce=flag_nonce)
        plaintext2 = cipher2.decrypt_and_verify(flag_ct, flag_tag)
        print(f"\n[+] FLAG: {plaintext2.decode()}")
    except Exception as e2:
        print(f"[-] Error con clave negada también: {e2}")
        print("[*] Intentando variaciones del poisoned value...")
        for pv in range(-10, 11):
            for pi_try in zero_indices:
                test_key = list(recovered_sk)
                test_key[pi_try] = pv
                aes_try = kdf(test_key, gr48_poly, gr48_gen)
                try:
                    ct = AES.new(aes_try, AES.MODE_GCM, nonce=flag_nonce)
                    pt = ct.decrypt_and_verify(flag_ct, flag_tag)
                    print(f"\n[+] FLAG: {pt.decode()}")
                    print(f"[+] poisoned_index={pi_try}, value={pv}")
                    exit(0)
                except:
                    pass
        print("[-] No se encontró la flag con ninguna variación")
