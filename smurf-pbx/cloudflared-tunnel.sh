#!/bin/bash
echo "=============================================================="
echo "SMURF PBX - Cloudflare Tunnel for Live Demo"
echo "=============================================================="
echo "Starting all services and exposing admin panel + WebRTC softphone..."
echo ""

# Ensure services are running
echo "Starting SMURF services..."
systemctl restart smurf-sip smurf-web || true
sleep 3

# Install cloudflared if not present
if ! command -v cloudflared &> /dev/null; then
    echo "Installing cloudflared..."
    wget -q https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -O /usr/local/bin/cloudflared
    chmod +x /usr/local/bin/cloudflared
fi

echo "Creating tunnel to SMURF admin panel (port 5001) and WebSocket (8080)..."
echo "This will provide a public HTTPS URL for the full web UI, softphone, and API."
echo ""
echo "Once tunnel is active, visit the provided URL in your browser."
echo "Login: admin / smurfadmin123"
echo "Test extensions 101/102 ready for WebRTC calls."
echo ""
echo "Press Ctrl+C to stop the tunnel."
echo "=============================================================="

# Run tunnel (cloudflared will output the public URL)
cloudflared tunnel --url http://localhost:5001 --hostname smurf-pbx-demo --no-autoupdate
