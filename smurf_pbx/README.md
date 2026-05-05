# SMURF PBX

SMURF is an enterprise communications platform built from scratch, designed to be a fully functional PBX without relying on existing software like Asterisk, FreeSWITCH, or Kamailio.

## Features (In Progress / Implemented)
- SIP Server (UDP 5060)
- Web Admin Panel (HTTPS 5001)
- Extension Management
- REST API

## Installation

1. Clone or download the repository to your server.
2. Run the installation script as root or with sudo:
   ```bash
   sudo ./install.sh
   ```
3. The script will install dependencies, set up the Python environment, copy files to `/opt/smurf_pbx`, and start the systemd services.

## Services
- `smurf-sip.service`: Handles the SIP signaling on port 5060 (UDP).
- `smurf-web.service`: Handles the Web Admin Panel and REST API on port 5001 (HTTPS).

## Usage
Access the admin panel at `https://<your-server-ip>:5001`.
(Note: It uses a self-signed certificate by default, so you may need to bypass the browser warning).

## Default Ports
- SIP: 5060 UDP
- Web Admin: 5001 TCP (HTTPS)
