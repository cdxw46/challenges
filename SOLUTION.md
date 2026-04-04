# Hook My Secret - CTF Writeup

## Flag

```
NCTF{a680107e-a49b-43e1-915b-cedd25e7835a}
```

## Descripción

APK Android con 3 etapas de verificación:

### Stage 1: Pattern Lock
- Patrón 3x3 cuya representación como string separado por comas se hashea con SHA-256.
- Hash objetivo: `4a6bc34076c8eef0f9eac59ad30d99bb4f56ecea4b0bfab92540fb655ac680f3`
- Solución: `0,1,2,4,8` (fuerza bruta)

### Stage 2: Native Encryption  
- El input se pasa a `libhookmysecret.so` -> `encryptStage2()`
- Cifrado personalizado byte a byte con operaciones XOR, ROL, y acumulador.
- Target: `[250, 113, 87, 185, 6, 125, 167, 156, 4, 0, 229, 239, 119, 155, 187, 95]`
- Solución: `k7Xm2Pq9Wv4N8bRt` (reversión del algoritmo)

### Stage 3: AES Decryption
- AES/CBC/PKCS5Padding
- Clave: output de Stage 2 (`k7Xm2Pq9Wv4N8bRt`)
- IV: `VerifyVector1234` (base64: `VmVyaWZ5VmVjdG9yMTIzNA==`, almacenado en SQLite)
- Ciphertext base64: `jSaMnziall55Tdr+IZc7EKUNm/N4uwrZw1QFPw6DuirfYFJZg88j6GKLhWfNljAB`
- El texto del usuario se cifra y se compara con el ciphertext esperado.
- Flag obtenida descifrando el ciphertext.
