import asyncio
import json
import logging
import websockets
import ssl
import sqlite3

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('SMURF-WEBRTC')

DB_PATH = '/workspace/smurf_pbx/smurf.db'
connected_clients = {} # ext -> websocket

async def handle_client(websocket, path):
    ext = None
    try:
        async for message in websocket:
            data = json.loads(message)
            logger.debug(f"Received from {ext}: {data['type']}")
            
            if data['type'] == 'register':
                ext = data['ext']
                # Mock auth
                connected_clients[ext] = websocket
                
                # Update DB
                conn = sqlite3.connect(DB_PATH)
                c = conn.cursor()
                c.execute("UPDATE extensions SET status='online' WHERE ext=?", (ext,))
                conn.commit()
                conn.close()
                
                await websocket.send(json.dumps({'type': 'registered', 'ext': ext}))
                logger.info(f"WebRTC client registered: {ext}")
                
            elif data['type'] == 'invite':
                target = data['target']
                sdp = data['sdp']
                
                # Log CDR
                conn = sqlite3.connect(DB_PATH)
                c = conn.cursor()
                c.execute("INSERT INTO cdr (caller, callee, status) VALUES (?, ?, 'RINGING')", (ext, target))
                cdr_id = c.lastrowid
                conn.commit()
                conn.close()
                
                if target in connected_clients:
                    logger.info(f"Routing WebRTC call {ext} -> {target}")
                    await connected_clients[target].send(json.dumps({
                        'type': 'incoming_call',
                        'caller': ext,
                        'sdp': sdp
                    }))
                else:
                    logger.warning(f"Target {target} not online")
                    c.execute("UPDATE cdr SET status='FAILED' WHERE id=?", (cdr_id,))
                    conn.commit()
                    
            elif data['type'] == 'answer':
                # For simplicity, assuming 1 active call, we broadcast answer to the other party
                # In a real PBX, we'd track call states and IDs
                for other_ext, ws in connected_clients.items():
                    if other_ext != ext:
                        await ws.send(json.dumps({
                            'type': 'answer',
                            'sdp': data['sdp']
                        }))
                        
            elif data['type'] == 'bye':
                for other_ext, ws in connected_clients.items():
                    if other_ext != ext:
                        await ws.send(json.dumps({'type': 'bye'}))
                        
    except websockets.exceptions.ConnectionClosed:
        pass
    finally:
        if ext in connected_clients:
            del connected_clients[ext]
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("UPDATE extensions SET status='offline' WHERE ext=?", (ext,))
            conn.commit()
            conn.close()
            logger.info(f"WebRTC client disconnected: {ext}")

async def main():
    # Generate self-signed cert for wss://
    import os
    if not os.path.exists('cert.pem'):
        os.system('openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes -subj "/CN=smurfpbx"')
        
    ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    ssl_context.load_cert_chain('cert.pem', 'key.pem')
    
    server = await websockets.serve(handle_client, "0.0.0.0", 5002, ssl=ssl_context)
    logger.info("SMURF WebRTC Signaling Server running on wss://0.0.0.0:5002/ws")
    await server.wait_closed()

if __name__ == "__main__":
    asyncio.run(main())
