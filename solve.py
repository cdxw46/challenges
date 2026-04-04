"""
CTF: RITSEC - not_quite_optimal
Hint: "whoopsies, maybe i should have used -O3"

The binary is a chat-like program that:
1. Asks for "looking for the flag"
2. Asks for "please" (lowercase)
3. Asks for "PLEASE MAY I HAVE THE FLAG"
4. Then computes 84 characters of the flag using tetration (iterated exponentiation)
   with GMP, compiled without -O3 making it extremely slow.

Each character is computed as:
  char = (base^^height mod 256 + 1) // 2
where base^^height is tetration (base^base^base^... height times).

Solution: use the generalized Euler theorem to compute tetration mod 256
efficiently via recursive totient chain.

Flag: RS{4_littl3_bi7_0f_numb3r_th30ry_n3v3r_hur7_4ny0n3_19b3369a25c78095689a38f81aa3f5e3}
"""

def euler_totient(n):
    result = n
    temp = n
    p = 2
    while p * p <= temp:
        if temp % p == 0:
            while temp % p == 0:
                temp //= p
            result -= result // p
        p += 1
    if temp > 1:
        result -= result // temp
    return result


def tetration_mod(base, height, mod):
    """Compute base^^height mod mod using generalized Euler's theorem."""
    if mod == 1:
        return 0
    if height == 0:
        return 1 % mod
    if height == 1:
        return base % mod
    if base == 0:
        return 1 if height % 2 == 0 else 0
    if base == 1:
        return 1 % mod

    phi = euler_totient(mod)
    exp_mod_phi = tetration_mod(base, height - 1, phi)
    return pow(base, phi + exp_mod_phi, mod)


table = [
    (706619, 2), (1649525, 2), (3315141, 2), (3672983, 2),
    (4928205, 2), (6572583, 2), (7251665, 2), (8006167, 2),
    (9234967, 2), (10999079, 2), (12166197, 2), (12713677, 2),
    (14184475, 2), (15187153, 2), (16285821, 2), (17152205, 2),
    (18416031, 2), (19752403, 2), (20414413, 2), (21681219, 2),
    (22922665, 2),
    (153, 3), (315, 3), (245, 3), (283, 3), (269, 3),
    (407, 3), (303, 3), (245, 3), (415, 3), (283, 3),
    (497, 3), (525, 3), (483, 3), (501, 3), (595, 3),
    (501, 3), (539, 3), (781, 3), (559, 3), (681, 3), (795, 3),
    (37821, 4), (378893, 4), (537623, 4), (786019, 4),
    (970481, 4), (1042079, 4), (1271139, 4), (1563637, 4),
    (1634061, 4), (1918561, 4), (2035825, 4), (2293947, 4),
    (2518005, 4), (2680053, 4), (2895187, 4), (3033713, 4),
    (3240129, 4), (3467035, 4), (3774761, 4), (3909973, 4),
    (4194493, 4),
    (54159, 149342), (1294751, 604952), (2427249, 1608521),
    (4153129, 2179249), (5317715, 2250678), (5864847, 2934817),
    (7197297, 3408840), (8542401, 4363230), (9059573, 4964726),
    (10868623, 5048712), (11699955, 5752627), (12877967, 6325831),
    (13906273, 6972103), (14916033, 7701091), (16070081, 7857668),
    (17559541, 8684992), (18252019, 9359719), (19350313, 9850159),
    (20839305, 10402185), (21715701, 10616502), (22340793, 11301289),
]

if __name__ == "__main__":
    flag = ""
    for i, (base, exp) in enumerate(table):
        val = tetration_mod(base, exp, 256)
        char_val = (val + 1) // 2
        flag += chr(char_val)

    print(f"Flag: {flag}")
