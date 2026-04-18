#!/usr/bin/env python3
from flask import Flask, jsonify, request, send_from_directory
import sqlite3
import os

app = Flask(__name__, static_folder='static')
DB_PATH = '/workspace/smurf_pbx/smurf.db'

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/softphone')
def softphone():
    return send_from_directory('static', 'softphone.html')

@app.route('/api/status')
def status():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT COUNT(*) as count FROM extensions WHERE status='online'")
    online = c.fetchone()['count']
    c.execute("SELECT COUNT(*) as count FROM cdr WHERE status='RINGING' OR status='ANSWERED'")
    active_calls = c.fetchone()['count']
    conn.close()
    
    return jsonify({
        "status": "running",
        "version": "1.0",
        "name": "SMURF PBX",
        "online_extensions": online,
        "active_calls": active_calls
    })

@app.route('/api/extensions', methods=['GET', 'POST'])
def extensions():
    conn = get_db()
    c = conn.cursor()
    if request.method == 'POST':
        data = request.json
        c.execute("INSERT OR REPLACE INTO extensions (ext, password, name) VALUES (?, ?, ?)", 
                  (data.get('ext'), data.get('password'), data.get('name')))
        conn.commit()
        conn.close()
        return jsonify({"status": "created", "extension": data.get('ext')})
    
    c.execute("SELECT ext, name, status, ip FROM extensions")
    exts = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify({"extensions": exts})

@app.route('/api/cdr')
def cdr():
    conn = get_db()
    c = conn.cursor()
    c.execute("SELECT * FROM cdr ORDER BY id DESC LIMIT 50")
    records = [dict(row) for row in c.fetchall()]
    conn.close()
    return jsonify({"cdr": records})

if __name__ == '__main__':
    # Run on port 5001 as requested
    app.run(host='0.0.0.0', port=5001, ssl_context='adhoc')
