#!/usr/bin/env python3
import socket
import asyncio
import re
import logging

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('SMURF-SIP')

class SIPServer:
    def __init__(self, host='0.0.0.0', port=5060):
        self.host = host
        self.port = port
        self.users = {} # extension -> ip:port

    def start(self):
        sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        sock.bind((self.host, self.port))
        logger.info(f"SMURF SIP Server listening on {self.host}:{self.port}/UDP")
        
        while True:
            data, addr = sock.recvfrom(4096)
            self.handle_message(data.decode('utf-8', errors='ignore'), addr, sock)

    def handle_message(self, message, addr, sock):
        lines = message.split('\r\n')
        if not lines: return
        
        request_line = lines[0]
        logger.debug(f"Received from {addr}: {request_line}")
        
        if request_line.startswith('REGISTER'):
            self.handle_register(message, lines, addr, sock)
        elif request_line.startswith('INVITE'):
            self.handle_invite(message, lines, addr, sock)
        else:
            # Send 200 OK for OPTIONS or other methods to keep alive
            self.send_response(200, "OK", message, addr, sock)

    def handle_register(self, message, lines, addr, sock):
        # Extract To header to find extension
        to_header = next((line for line in lines if line.startswith('To:')), None)
        if to_header:
            match = re.search(r'sip:(\d+)@', to_header)
            if match:
                ext = match.group(1)
                self.users[ext] = addr
                logger.info(f"Registered extension {ext} at {addr}")
                self.send_response(200, "OK", message, addr, sock)

    def handle_invite(self, message, lines, addr, sock):
        # Basic routing
        to_header = next((line for line in lines if line.startswith('To:')), None)
        if to_header:
            match = re.search(r'sip:(\d+)@', to_header)
            if match:
                ext = match.group(1)
                if ext in self.users:
                    logger.info(f"Routing call to {ext} at {self.users[ext]}")
                    # Forward INVITE to target
                    sock.sendto(message.encode('utf-8'), self.users[ext])
                else:
                    self.send_response(404, "Not Found", message, addr, sock)

    def send_response(self, code, phrase, request, addr, sock):
        req_lines = request.split('\r\n')
        via = next((line for line in req_lines if line.startswith('Via:')), '')
        to_hdr = next((line for line in req_lines if line.startswith('To:')), '')
        from_hdr = next((line for line in req_lines if line.startswith('From:')), '')
        call_id = next((line for line in req_lines if line.startswith('Call-ID:')), '')
        cseq = next((line for line in req_lines if line.startswith('CSeq:')), '')
        
        response = f"SIP/2.0 {code} {phrase}\r\n"
        response += f"{via}\r\n{to_hdr}\r\n{from_hdr}\r\n{call_id}\r\n{cseq}\r\n"
        response += "Server: SMURF PBX v1.0\r\nContent-Length: 0\r\n\r\n"
        
        sock.sendto(response.encode('utf-8'), addr)

if __name__ == "__main__":
    server = SIPServer()
    server.start()
