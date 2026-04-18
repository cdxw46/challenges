#!/bin/bash
set -e

echo "Starting SMURF PBX Installation..."

# Install dependencies
sudo apt-get update
sudo apt-get install -y python3 python3-pip python3-venv openssl

# Create virtual environment
python3 -m venv /opt/smurf_pbx/venv
source /opt/smurf_pbx/venv/bin/activate

# Install python packages
pip install flask pyopenssl

# Copy files
sudo mkdir -p /opt/smurf_pbx/static
sudo cp smurf_sip.py /opt/smurf_pbx/
sudo cp smurf_web.py /opt/smurf_pbx/
sudo cp static/index.html /opt/smurf_pbx/static/

# Create systemd services
cat <<EOF | sudo tee /etc/systemd/system/smurf-sip.service
[Unit]
Description=SMURF SIP Server
After=network.target

[Service]
ExecStart=/opt/smurf_pbx/venv/bin/python /opt/smurf_pbx/smurf_sip.py
Restart=always
User=root

[Install]
WantedBy=multi-user.target
EOF

cat <<EOF | sudo tee /etc/systemd/system/smurf-web.service
[Unit]
Description=SMURF Web Admin (Port 5001)
After=network.target

[Service]
ExecStart=/opt/smurf_pbx/venv/bin/python /opt/smurf_pbx/smurf_web.py
Restart=always
User=root
WorkingDirectory=/opt/smurf_pbx

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
sudo systemctl enable smurf-sip
sudo systemctl enable smurf-web
sudo systemctl start smurf-sip
sudo systemctl start smurf-web

echo "SMURF PBX installed successfully!"
echo "Admin panel available at https://<server-ip>:5001"
