// SMURF softphone front-end controller — uses sip-ws.js as the SIP UA and
// ties it to the simple dialer UI.
(function () {
  const $ = (s) => document.querySelector(s);
  const log = (msg) => { const p = $('#log'); p.textContent += msg + '\n'; p.scrollTop = p.scrollHeight; };
  const setStatus = (txt, cls) => { const s = $('#status'); s.textContent = txt; s.className = 'badge ' + cls; };
  const setState = (txt) => { $('#display-state').textContent = txt; };

  let ua = null;
  let activeCall = null;
  let localStream = null;
  let pendingIncoming = null;

  // Auto-detect server (host:port from URL)
  $('#srv').value = `${location.hostname}:${location.protocol === 'https:' ? '8089' : '8088'}`;

  // Keypad
  document.querySelectorAll('.keypad button').forEach(b => b.addEventListener('click', () => {
    $('#display-num').textContent = ($('#display-num').textContent.trim() || '') + b.textContent;
    if (activeCall && ua) {
      // In-call: send DTMF over RTCP/INFO is complex; use RFC 2833 via insertDTMF
      const dialog = ua.dialogs.get(activeCall);
      if (dialog && dialog.pc) {
        const sender = dialog.pc.getSenders().find(s => s.dtmf);
        if (sender && sender.dtmf) sender.dtmf.insertDTMF(b.textContent, 100, 50);
      }
    }
  }));

  $('#connect').addEventListener('click', async () => {
    const srv = $('#srv').value.trim();
    const ext = $('#ext').value.trim();
    const pwd = $('#pwd').value;
    const disp = $('#disp').value || ext;
    const useWss = $('#usews').checked && location.protocol === 'https:';
    const proto = useWss ? 'wss' : 'ws';
    const wsUrl = `${proto}://${srv}`;
    const host = srv.split(':')[0];
    setStatus('connecting…', 'gray');
    try {
      ua = new SmurfSipUA({
        uri: `sip:${ext}@${host}`, user: ext, pwd, host, wsUrl, displayName: disp,
        callbacks: {
          onLog: log,
          onRegistered: (ok) => {
            if (ok) {
              setStatus('registered', 'green');
              $('#phone-login').classList.add('hidden');
              $('#phone-dialer').classList.remove('hidden');
            } else { setStatus('reg failed', 'red'); $('#login-err').textContent = 'Registration failed'; }
          },
          onProgress: (id, code) => setState(`ringing… (${code})`),
          onConnected: (id) => { activeCall = id; setState('in call'); $('#hangup').disabled = false; },
          onEnded: (id) => { activeCall = null; setState('idle'); $('#display-num').textContent = '\u00a0'; $('#hangup').disabled = true; if (pendingIncoming) { pendingIncoming = null; $('#incoming').classList.add('hidden'); } },
          onRemoteStream: (s) => { $('#audio-remote').srcObject = s; },
          onIncoming: async (info) => {
            return new Promise(resolve => {
              pendingIncoming = { info, resolve };
              $('#inc-from').textContent = info.from;
              $('#incoming').classList.remove('hidden');
              setState('incoming');
            });
          },
          onDisconnected: () => setStatus('offline', 'gray'),
        },
      });
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      await ua.connect();
    } catch (e) {
      console.error(e);
      $('#login-err').textContent = 'Connect error: ' + (e.message || e);
      setStatus('error', 'red');
    }
  });

  $('#call').addEventListener('click', async () => {
    if (!ua) return;
    const target = ($('#display-num').textContent || '').trim();
    if (!target) return;
    setState('dialing…');
    activeCall = await ua.call(target, localStream);
    $('#hangup').disabled = false;
  });

  $('#hangup').addEventListener('click', () => {
    if (ua && activeCall) ua.hangup(activeCall);
    activeCall = null; setState('idle'); $('#hangup').disabled = true;
  });

  $('#answer').addEventListener('click', () => {
    if (pendingIncoming) {
      pendingIncoming.resolve({ mediaStream: localStream });
      activeCall = pendingIncoming.info.callId;
      $('#incoming').classList.add('hidden');
      $('#hangup').disabled = false;
      pendingIncoming = null;
    }
  });
  $('#reject').addEventListener('click', () => {
    if (pendingIncoming) {
      pendingIncoming.resolve(false);
      $('#incoming').classList.add('hidden');
      pendingIncoming = null;
    }
  });
})();
