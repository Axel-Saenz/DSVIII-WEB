/* app.js - cliente WebSocket para el dashboard */
(function () {
  const vehicles = document.getElementById('vehicles');
  const available = document.getElementById('available');
  const misparked = document.getElementById('misparked');
  const wsUrlInput = document.getElementById('wsUrl');
  const connectBtn = document.getElementById('connectBtn');
  const disconnectBtn = document.getElementById('disconnectBtn');
  const simulateBtn = document.getElementById('simulateBtn');
  const videoImg = document.getElementById('videoStream');

  let ws = null;
  let simulateInterval = null;

  function updateCounters(obj) {
    if (typeof obj.vehicles !== 'undefined') vehicles.textContent = obj.vehicles;
    if (typeof obj.available !== 'undefined') available.textContent = obj.available;
    if (typeof obj.misparked !== 'undefined') misparked.textContent = obj.misparked;
  }

  function connect() {
    if (ws) ws.close();
    try {
      ws = new WebSocket(wsUrlInput.value);
    } catch (e) {
      alert('URL WebSocket inválida');
      return;
    }
    ws.binaryType = 'arraybuffer';
    connectBtn.disabled = true;
    disconnectBtn.disabled = false;
    ws.onopen = () => console.log('WS abierto');
    ws.onclose = () => {
      console.log('WS cerrado');
      connectBtn.disabled = false;
      disconnectBtn.disabled = true;
    };
    ws.onerror = (e) => console.error('WS error', e);
    ws.onmessage = (ev) => {
      if (typeof ev.data === 'string') {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'counters' && msg.payload) {
            updateCounters(msg.payload);
            return;
          }
          if (msg.type === 'frame' && msg.data) {
            videoImg.src = 'data:image/jpeg;base64,' + msg.data;
            return;
          }
        } catch (e) {
          // not JSON - could be a raw base64 image or data URL
          if (ev.data.startsWith('data:image/')) {
            videoImg.src = ev.data;
            return;
          }
          if (/^[A-Za-z0-9+/=\r\n]+$/.test(ev.data)) {
            videoImg.src = 'data:image/jpeg;base64,' + ev.data.replace(/\s+/g, '');
            return;
          }
        }
      } else if (ev.data instanceof ArrayBuffer) {
        const blob = new Blob([ev.data], { type: 'image/jpeg' });
        const url = URL.createObjectURL(blob);
        videoImg.src = url;
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      }
    };
  }

  function disconnect() {
    if (ws) {
      ws.close();
      ws = null;
    }
    connectBtn.disabled = false;
    disconnectBtn.disabled = true;
  }

  function makeSvgFrame(text) {
    const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='640' height='360'><rect width='100%' height='100%' fill='#333'/><text x='50%' y='50%' fill='#fff' font-size='24' text-anchor='middle' dominant-baseline='middle'>${text}</text></svg>`;
    return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  }

  function startSimulate() {
    if (simulateInterval) {
      clearInterval(simulateInterval);
      simulateInterval = null;
      simulateBtn.textContent = 'Simular';
      return;
    }
    simulateBtn.textContent = 'Parar simulación';
    let v = 12, a = 8, m = 1;
    updateCounters({ vehicles: v, available: a, misparked: m });
    videoImg.src = makeSvgFrame('Simulación iniciada');
    simulateInterval = setInterval(() => {
      v = Math.max(0, v + (Math.random() > 0.5 ? 1 : -1));
      a = Math.max(0, 20 - v);
      m = Math.max(0, Math.floor(Math.random() * 4));
      updateCounters({ vehicles: v, available: a, misparked: m });
      videoImg.src = makeSvgFrame(`Frame ${Date.now() % 10000}`);
    }, 1500);
  }

  connectBtn.addEventListener('click', () => { startSimulateOff(); connect(); });
  disconnectBtn.addEventListener('click', disconnect);
  simulateBtn.addEventListener('click', () => { startSimulate(); });

  function startSimulateOff() {
    if (simulateInterval) {
      clearInterval(simulateInterval);
      simulateInterval = null;
      simulateBtn.textContent = 'Simular';
    }
  }

  window.dashboard = { updateCounters };
})();
