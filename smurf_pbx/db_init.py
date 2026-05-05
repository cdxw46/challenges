import sqlite3
import os

DB_PATH = '/workspace/smurf_pbx/smurf.db'

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    
    # Extensions table
    c.execute('''
        CREATE TABLE IF NOT EXISTS extensions (
            ext TEXT PRIMARY KEY,
            password TEXT NOT NULL,
            name TEXT,
            status TEXT DEFAULT 'offline',
            ip TEXT,
            port INTEGER
        )
    ''')
    
    # CDR table
    c.execute('''
        CREATE TABLE IF NOT EXISTS cdr (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            caller TEXT,
            callee TEXT,
            start_time DATETIME DEFAULT CURRENT_TIMESTAMP,
            end_time DATETIME,
            duration INTEGER,
            status TEXT
        )
    ''')
    
    # Insert default extensions
    c.execute("INSERT OR IGNORE INTO extensions (ext, password, name) VALUES ('100', 'secret100', 'Admin')")
    c.execute("INSERT OR IGNORE INTO extensions (ext, password, name) VALUES ('101', 'secret101', 'User 1')")
    c.execute("INSERT OR IGNORE INTO extensions (ext, password, name) VALUES ('102', 'secret102', 'User 2')")
    
    conn.commit()
    conn.close()

if __name__ == '__main__':
    init_db()
    print("Database initialized successfully.")
