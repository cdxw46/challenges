import asyncio
import socket
import logging
import re
import sqlite3
import hashlib

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('SMURF-CORE')

DB_PATH = '/workspace/smurf_pbx/smurf.db'

class SIPCore(asyncio.DatagramProtocol):
    def __init__(self):
        self.transport = None
        self.active_calls = {} # call_id -> {caller, callee, state}

    def connection_made(self, transport):
        self.transport = transport
        logger.info("SMURF SIP Core started on UDP 5060")

    def datagram_received(self, data, addr):
        message = data.decode('utf-8', errors='ignore')
        logger.debug(f"Received from {addr}:\n{message}")
        
        lines = message.split('\r\n')
        if not lines: return
        
        request_line = lines[0]
        
        if request_line.startswith('REGISTER'):
            self.handle_register(message, lines, addr)
        elif request_line.startswith('INVITE'):
            self.handle_invite(message, lines, addr)
        elif request_line.startswith('ACK'):
            self.handle_ack(message, lines, addr)
        elif request_line.startswith('BYE'):
            self.handle_bye(message, lines, addr)
        elif request_line.startswith('SIP/2.0'):
            self.handle_response(message, lines, addr)
        else:
            self.send_response(200, "OK", message, addr)

    def handle_register(self, message, lines, addr):
        to_header = self.get_header(lines, 'To:')
        from_header = self.get_header(lines, 'From:')
        call_id = self.get_header(lines, 'Call-ID:')
        
        match = re.search(r'sip:(\d+)@', to_header)
        if not match: return
        ext = match.group(1)
        
        # Simple auth check (mocked for speed, normally challenge-response)
        # Update DB
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("UPDATE extensions SET status='online', ip=?, port=? WHERE ext=?", (addr[0], addr[1], ext))
        conn.commit()
        conn.close()
        
        logger.info(f"Registered extension {ext} at {addr}")
        self.send_response(200, "OK", message, addr)

    def handle_invite(self, message, lines, addr):
        to_header = self.get_header(lines, 'To:')
        from_header = self.get_header(lines, 'From:')
        call_id = self.get_header(lines, 'Call-ID:')
        
        caller_match = re.search(r'sip:(\d+)@', from_header)
        callee_match = re.search(r'sip:(\d+)@', to_header)
        
        if not caller_match or not callee_match:
            self.send_response(400, "Bad Request", message, addr)
            return
            
        caller = caller_match.group(1)
        callee = callee_match.group(1)
        
        logger.info(f"Call initiated: {caller} -> {callee}")
        
        # Find callee
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute("SELECT ip, port FROM extensions WHERE ext=? AND status='online'", (callee,))
        row = c.fetchone()
        
        if not row:
            self.send_response(404, "Not Found", message, addr)
            # Log CDR
            c.execute("INSERT INTO cdr (caller, callee, duration, status) VALUES (?, ?, 0, 'FAILED')", (caller, callee))
            conn.commit()
            conn.close()
            return
            
        callee_addr = (row[0], row[1])
        
        # Log CDR
        c.execute("INSERT INTO cdr (caller, callee, status) VALUES (?, ?, 'RINGING')", (caller, callee))
        cdr_id = c.lastrowid
        conn.commit()
        conn.close()
        
        self.active_calls[call_id] = {
            'caller_ext': caller,
            'callee_ext': callee,
            'caller_addr': addr,
            'callee_addr': callee_addr,
            'state': 'RINGING',
            'cdr_id': cdr_id
        }
        
        # Send 100 Trying to caller
        self.send_response(100, "Trying", message, addr)
        
        # Forward INVITE to callee
        # We need to act as a proxy
        forwarded_invite = message # In a real PBX, we'd rewrite Record-Route, Via, Contact, and SDP
        self.transport.sendto(forwarded_invite.encode('utf-8'), callee_addr)

    def handle_response(self, message, lines, addr):
        # Forward responses back to caller
        call_id = self.get_header(lines, 'Call-ID:')
        if call_id in self.active_calls:
            call = self.active_calls[call_id]
            if addr == call['callee_addr']:
                self.transport.sendto(message.encode('utf-8'), call['caller_addr'])
                if "200 OK" in lines[0] and "CSeq: " in message and "INVITE" in message:
                    call['state'] = 'ANSWERED'
                    conn = sqlite3.connect(DB_PATH)
                    c = conn.cursor()
                    c.execute("UPDATE cdr SET status='ANSWERED' WHERE id=?", (call['cdr_id'],))
                    conn.commit()
                    conn.close()

    def handle_ack(self, message, lines, addr):
        call_id = self.get_header(lines, 'Call-ID:')
        if call_id in self.active_calls:
            call = self.active_calls[call_id]
            if addr == call['caller_addr']:
                self.transport.sendto(message.encode('utf-8'), call['callee_addr'])

    def handle_bye(self, message, lines, addr):
        call_id = self.get_header(lines, 'Call-ID:')
        if call_id in self.active_calls:
            call = self.active_calls[call_id]
            target_addr = call['callee_addr'] if addr == call['caller_addr'] else call['caller_addr']
            self.transport.sendto(message.encode('utf-8'), target_addr)
            self.send_response(200, "OK", message, addr)
            
            # Update CDR
            conn = sqlite3.connect(DB_PATH)
            c = conn.cursor()
            c.execute("UPDATE cdr SET status='COMPLETED', end_time=CURRENT_TIMESTAMP, duration=strftime('%s','now') - strftime('%s',start_time) WHERE id=?", (call['cdr_id'],))
            conn.commit()
            conn.close()
            
            del self.active_calls[call_id]
            logger.info(f"Call {call_id} ended")

    def get_header(self, lines, header_name):
        for line in lines:
            if line.startswith(header_name):
                return line[len(header_name):].strip()
        return ""

    def send_response(self, code, phrase, request, addr):
        req_lines = request.split('\r\n')
        via = next((line for line in req_lines if line.startswith('Via:')), '')
        to_hdr = next((line for line in req_lines if line.startswith('To:')), '')
        from_hdr = next((line for line in req_lines if line.startswith('From:')), '')
        call_id = next((line for line in req_lines if line.startswith('Call-ID:')), '')
        cseq = next((line for line in req_lines if line.startswith('CSeq:')), '')
        
        # Add tag to To header if not present for 200 OK
        if code == 200 and 'tag=' not in to_hdr:
            to_hdr += ';tag=smurf12345'
            
        response = f"SIP/2.0 {code} {phrase}\r\n"
        response += f"{via}\r\n{to_hdr}\r\n{from_hdr}\r\n{call_id}\r\n{cseq}\r\n"
        response += "Server: SMURF PBX Core v1.0\r\nContent-Length: 0\r\n\r\n"
        
        self.transport.sendto(response.encode('utf-8'), addr)

async def main():
    loop = asyncio.get_running_loop()
    transport, protocol = await loop.create_datagram_endpoint(
        lambda: SIPCore(),
        local_addr=('0.0.0.0', 5060)
    )
    try:
        await asyncio.sleep(3600)  # Run for 1 hour
    finally:
        transport.close()

if __name__ == '__main__':
    asyncio.run(main())
