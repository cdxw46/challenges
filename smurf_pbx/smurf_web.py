#!/usr/bin/env python3
from flask import Flask, jsonify, request, send_from_directory
import os

app = Flask(__name__, static_folder='static')

@app.route('/')
def index():
    return send_from_directory('static', 'index.html')

@app.route('/api/status')
def status():
    return jsonify({"status": "running", "version": "1.0", "name": "SMURF PBX"})

@app.route('/api/extensions', methods=['GET', 'POST'])
def extensions():
    if request.method == 'POST':
        data = request.json
        # Save extension to DB (mocked)
        return jsonify({"status": "created", "extension": data.get('ext')})
    return jsonify({"extensions": [{"ext": "100", "status": "online"}, {"ext": "101", "status": "offline"}]})

if __name__ == '__main__':
    # Run on port 5001 as requested
    app.run(host='0.0.0.0', port=5001, ssl_context='adhoc')
