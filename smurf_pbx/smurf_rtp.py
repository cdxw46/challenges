import socket
import threading
import logging

logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger('SMURF-RTP')

class RTPRelay:
    def __init__(self, port_a, port_b):
        self.port_a = port_a
        self.port_b = port_b
        self.sock_a = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        self.sock_b = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        
        self.sock_a.bind(('0.0.0.0', self.port_a))
        self.sock_b.bind(('0.0.0.0', self.port_b))
        
        self.client_a = None
        self.client_b = None
        
        self.running = True

    def start(self):
        logger.info(f"Starting RTP Relay: Port A {self.port_a} <-> Port B {self.port_b}")
        t_a = threading.Thread(target=self.relay_a_to_b)
        t_b = threading.Thread(target=self.relay_b_to_a)
        t_a.start()
        t_b.start()

    def relay_a_to_b(self):
        while self.running:
            try:
                data, addr = self.sock_a.recvfrom(4096)
                if not self.client_a:
                    self.client_a = addr
                    logger.info(f"RTP Client A connected from {addr}")
                
                if self.client_b:
                    self.sock_b.sendto(data, self.client_b)
            except Exception as e:
                logger.error(f"Error in relay A->B: {e}")

    def relay_b_to_a(self):
        while self.running:
            try:
                data, addr = self.sock_b.recvfrom(4096)
                if not self.client_b:
                    self.client_b = addr
                    logger.info(f"RTP Client B connected from {addr}")
                
                if self.client_a:
                    self.sock_a.sendto(data, self.client_a)
            except Exception as e:
                logger.error(f"Error in relay B->A: {e}")

    def stop(self):
        self.running = False
        self.sock_a.close()
        self.sock_b.close()
        logger.info(f"Stopped RTP Relay {self.port_a}-{self.port_b}")

if __name__ == '__main__':
    # Test relay
    relay = RTPRelay(10000, 10002)
    relay.start()
    try:
        import time
        time.sleep(3600)
    except KeyboardInterrupt:
        relay.stop()
