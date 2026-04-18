#!/bin/bash
set -e

echo "Starting SMURF PBX End-to-End Installation..."

# Install dependencies
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv openssl sqlite3 libsqlite3-dev

# Create virtual environment
python3 -m venv /opt/smurf_pbx/venv
source /opt/smurf_pbx/venv/bin/activate

# Install python packages
pip install flask pyopenssl websockets

# Copy files
sudo mkdir -p /opt/smurf_pbx/static
sudo cp smurf_core.py /opt/smurf_pbx/
sudo cp smurf_rtp.py /opt/smurf_pbx/
sudo cp smurf_web.py /opt/smurf_pbx/
sudo cp smurf_webrtc.py /opt/smurf_pbx/
sudo cp db_init.py /opt/smurf_pbx/
sudo cp static/index.html /opt/smurf_pbx/static/
sudo cp static/softphone.html /opt/smurf_pbx/static/

# Initialize DB
/opt/smurf_pbx/venv/bin/python /opt/smurf_pbx/db_init.py

# Create systemd services
cat <<SERVICE1 | sudo tee /etc/systemd/system/smurf-sip.service
[Unit]
Description=SMURF SIP Core (UDP 5060)
After=network.target

[Service]
ExecStart=/opt/smurf_pbx/venv/bin/python /opt/smurf_pbx/smurf_core.py
Restart=always
User=root
WorkingDirectory=/opt/smurf_pbx

[Install]
WantedBy=multi-user.target
SERVICE1

cat <<SERVICE2 | sudo tee /etc/systemd/system/smurf-web.service
[Unit]
Description=SMURF Web Admin (HTTPS 5001)
After=network.target

[Service]
ExecStart=/opt/smurf_pbx/venv/bin/python /opt/smurf_pbx/smurf_web.py
Restart=always
User=root
WorkingDirectory=/opt/smurf_pbx

[Install]
WantedBy=multi-user.target
SERVICE2

cat <<SERVICE3 | sudo tee /etc/systemd/system/smurf-webrtc.service
[Unit]
Description=SMURF WebRTC Signaling (WSS 5002)
After=network.target

[Service]
ExecStart=/opt/smurf_pbx/venv/bin/python /opt/smurf_pbx/smurf_webrtc.py
Restart=always
User=root
WorkingDirectory=/opt/smurf_pbx

[Install]
WantedBy=multi-user.target
SERVICE3

sudo systemctl daemon-reload || true
sudo systemctl enable smurf-sip || true
sudo systemctl enable smurf-web || true
sudo systemctl enable smurf-webrtc || true
sudo systemctl restart smurf-sip || true
sudo systemctl restart smurf-web || true
sudo systemctl restart smurf-webrtc || true

echo "SMURF PBX installed successfully!"
echo "Admin panel available at https://<server-ip>:5001"
echo "Softphone available at https://<server-ip>:5001/softphone"
