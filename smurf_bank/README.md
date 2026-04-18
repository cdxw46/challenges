# Smurf Bank — CTF Challenge

Banco ficticio de los Pitufos. Aplicación Flask con sistema de usuarios y un único administrador.

## Reto CTF (spoiler)

> No leas esto si vas a jugar el reto.

**Vulnerabilidad**: el verificador de JWT acepta el algoritmo `none`. Cualquier usuario autenticado puede manipular su token y poner `is_admin: true` para acceder al panel `/admin` y leer la flag.

Pistas dejadas en la app:
- Comentario HTML en `base.html` mencionando "JWT".
- `/robots.txt` apunta a `/admin`.
- Footer con guiño: *"Trust no one... not even your token's algorithm."*

**Flag**: `SMURF{jwt_n0ne_alg_1s_d4ng3r0us}`

## Cómo correr

```bash
cd smurf_bank
python3 -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
python3 init_db.py
python3 create_admin.py papasmurf S3cret_P4pa!  # crea el único admin
python3 app.py                                  # http://0.0.0.0:5000
```

## Crear admin

Solo puede existir **un** admin. El script lo refuerza:

```bash
python3 create_admin.py <username> <password>
```

Si ya existe, el script falla.

## Endpoints principales

- `GET  /`                 → landing
- `GET  /register`         → registro de usuarios normales
- `POST /register`
- `GET  /login`            → login (devuelve cookie JWT)
- `POST /login`
- `GET  /dashboard`        → saldo + historial
- `GET  /transfer`         → formulario de transferencia
- `POST /transfer`
- `GET  /admin`            → solo admin (la flag vive aquí)
- `GET  /robots.txt`
