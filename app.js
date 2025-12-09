/* app.js - cliente WebSocket para el dashboard */
(function () {
  const vehicles = document.getElementById('vehicles');
  const densityEl = document.getElementById('density');
  const clusterEl = document.getElementById('cluster');
  const apiBaseInput = document.getElementById('apiBase');
  const imageFileInput = document.getElementById('imageFile');
  const analyzeBtn = document.getElementById('analyzeBtn');
  const refreshTasksBtn = document.getElementById('refreshTasksBtn');
  const autoRefreshChk = document.getElementById('autoRefresh');
  const tasksList = document.getElementById('tasksList');
  const simulateBtn = document.getElementById('simulateBtn');
  const videoImg = document.getElementById('videoStream');

  let simulateInterval = null;
  let initialLoadDone = false;

  function updateCounters(obj) {
    if (typeof obj.vehicles !== 'undefined') vehicles.textContent = obj.vehicles;
    if (typeof obj.density !== 'undefined' && densityEl) densityEl.textContent = obj.density;
    if (typeof obj.cluster !== 'undefined' && clusterEl) clusterEl.textContent = obj.cluster;
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
    let v = 12, d = 40, c = 1;
    updateCounters({ vehicles: v, density: d, cluster: c });
    // Only show simulation frames if the video image is visible
    if (videoImg.style.display !== 'none') videoImg.src = makeSvgFrame('Simulación iniciada');
    simulateInterval = setInterval(() => {
      v = Math.max(0, v + (Math.random() > 0.5 ? 1 : -1));
      // assume capacity 20 for demo density calculation
      d = Math.max(0, Math.min(100, Math.round((v / 20) * 100)));
      c = Math.max(0, Math.floor(Math.random() * 5));
      updateCounters({ vehicles: v, density: d, cluster: c });
      if (videoImg.style.display !== 'none') videoImg.src = makeSvgFrame(`Frame ${Date.now() % 10000}`);
    }, 1500);
  }

  simulateBtn.addEventListener('click', () => { startSimulate(); });
  // NOTE: no inline preview on file select — image remains hidden until processing completes
  if (refreshTasksBtn) refreshTasksBtn.addEventListener('click', fetchTasks);
  if (analyzeBtn) analyzeBtn.addEventListener('click', onAnalyzeClicked);
  let tasksAutoRefreshInterval = null;
  if (autoRefreshChk) autoRefreshChk.addEventListener('change', (e) => {
    if (e.target.checked) {
      fetchTasks();
      tasksAutoRefreshInterval = setInterval(fetchTasks, 3000);
    } else {
      clearInterval(tasksAutoRefreshInterval);
      tasksAutoRefreshInterval = null;
    }
  });

  function startSimulateOff() {
    if (simulateInterval) {
      clearInterval(simulateInterval);
      simulateInterval = null;
      simulateBtn.textContent = 'Simular';
    }
  }

  window.dashboard = { updateCounters };

  function getApiBase() {
    return (apiBaseInput && apiBaseInput.value) ? apiBaseInput.value.replace(/\/$/, '') : 'http://localhost:8080';
  }

  // Debug helper: append message to debug panel and log to console
  function showDebug(title, payload) {
    try {
      const dbg = document.getElementById('debug');
      if (!dbg) return;
      dbg.hidden = false;
      const time = new Date().toLocaleTimeString();
      const header = document.createElement('div');
      header.style.fontWeight = '700';
      header.style.marginBottom = '6px';
      header.textContent = `[${time}] ${title}`;
      dbg.appendChild(header);
      const pre = document.createElement('pre');
      if (typeof payload === 'string') pre.textContent = payload; else pre.textContent = JSON.stringify(payload, null, 2);
      dbg.appendChild(pre);
      // auto-scroll
      dbg.scrollTop = dbg.scrollHeight;
    } catch (e) {
      console.error('showDebug error', e);
    }
  }

  // Show a top alert banner (nice styling) with optional JSON toggle
  function showAlert(title, message, jsonData) {
    try {
      const alerts = document.getElementById('alerts');
      if (!alerts) return;

      // create alert box
      const box = document.createElement('div');
      box.className = 'alert error';

      const icon = document.createElement('div');
      icon.className = 'icon';
      icon.textContent = '!';
      box.appendChild(icon);

      const content = document.createElement('div');
      content.className = 'content';
      const t = document.createElement('div');
      t.className = 'title';
      t.textContent = title;
      const m = document.createElement('div');
      m.className = 'message';
      m.textContent = message;
      content.appendChild(t);
      content.appendChild(m);

      const actions = document.createElement('div');
      actions.className = 'actions';
      if (jsonData) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Ver JSON';
        const pre = document.createElement('pre');
        pre.className = 'alert-json';
        pre.textContent = JSON.stringify(jsonData, null, 2);
        btn.addEventListener('click', () => {
          const open = pre.classList.toggle('open');
          btn.textContent = open ? 'Ocultar JSON' : 'Ver JSON';
        });
        actions.appendChild(btn);
        content.appendChild(actions);
        content.appendChild(pre);
      }

      box.appendChild(content);
      // insert at top of alerts
      alerts.prepend(box);
      // auto-remove after 30s
      setTimeout(() => {
        try { box.remove(); } catch (e) {}
      }, 30000);
    } catch (e) {
      console.error('showAlert error', e);
    }
  }

  // Show a compact, friendly error message inside the tasks list area
  function showTasksError(title, message, details) {
    try {
      if (!tasksList) return;
      // remove any previous tasks error
      const prev = document.getElementById('tasks-error-msg');
      if (prev) prev.remove();

      const li = document.createElement('li');
      li.id = 'tasks-error-msg';
      li.className = 'tasks-error-card';

      const left = document.createElement('div');
      left.className = 'tasks-error-left';
      const titleEl = document.createElement('div');
      titleEl.className = 'tasks-error-title';
      titleEl.textContent = title;
      const msgEl = document.createElement('div');
      msgEl.className = 'tasks-error-message';
      msgEl.textContent = message;
      left.appendChild(titleEl);
      left.appendChild(msgEl);

      const actions = document.createElement('div');
      actions.className = 'tasks-error-actions';
      if (details) {
        const btn = document.createElement('button');
        btn.textContent = 'Ver detalles';
        btn.className = 'details-btn';
        const pre = document.createElement('pre');
        pre.className = 'tasks-error-json';
        try { pre.textContent = typeof details === 'string' ? details : JSON.stringify(details, null, 2); } catch (e) { pre.textContent = String(details); }
        btn.addEventListener('click', () => {
          const open = pre.classList.toggle('open');
          btn.textContent = open ? 'Ocultar detalles' : 'Ver detalles';
        });
        actions.appendChild(btn);
        li.appendChild(pre);
      }

      li.appendChild(left);
      li.appendChild(actions);
      // insert at top of tasks list
      tasksList.parentNode.insertBefore(li, tasksList);
      // remove after some time
      setTimeout(() => { try { li.remove(); } catch (e) {} }, 30000);
    } catch (e) {
      console.error('showTasksError failed', e);
    }
  }

  // Render a friendly, human-readable result into the debug panel (non-JSON)
  function showResult(title, data) {
    try {
      const dbg = document.getElementById('debug');
      if (!dbg) return;
      dbg.hidden = false;
      const box = buildResultElement(title, data);
      dbg.appendChild(box);
      dbg.scrollTop = dbg.scrollHeight;
    } catch (e) {
      console.error('showResult error', e);
    }
  }

  // Build and return a DOM element with a friendly result summary (reusable)
  function buildResultElement(title, data) {
    const box = document.createElement('div');
    box.style.padding = '10px';
    box.style.marginTop = '8px';
    box.style.borderRadius = '8px';
    box.style.background = 'linear-gradient(90deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))';
    box.style.border = '1px solid rgba(255,255,255,0.03)';

    const header = document.createElement('div');
    header.style.fontWeight = '700';
    header.style.marginBottom = '8px';
    header.textContent = title;
    box.appendChild(header);

    const addRow = (label, value) => {
      const row = document.createElement('div');
      row.style.display = 'flex';
      row.style.gap = '12px';
      row.style.alignItems = 'center';
      const lab = document.createElement('div');
      lab.style.color = 'var(--muted)';
      lab.style.minWidth = '120px';
      lab.textContent = label + ':';
      const val = document.createElement('div');
      val.style.fontWeight = '600';
      val.textContent = (value === null || typeof value === 'undefined') ? '-' : String(value);
      row.appendChild(lab);
      row.appendChild(val);
      box.appendChild(row);
    };

    const task = data || {};
    addRow('Estado', (task.status || '-').toString());
    if (task.created_at) addRow('Creado', task.created_at);
    if (task.completed_at) addRow('Completado', task.completed_at);
    if (task.original_filename) addRow('Archivo', task.original_filename);
    if (task.message) addRow('Mensaje', task.message);

    const errMsg = task.error || (task.result && task.result.error) || task.error_message || null;
    if (errMsg) {
      const errRow = document.createElement('div');
      errRow.style.marginTop = '8px';
      errRow.style.padding = '8px';
      errRow.style.borderRadius = '8px';
      errRow.style.background = 'rgba(255,20,20,0.04)';
      errRow.style.color = '#ffb4b4';
      errRow.textContent = 'Error: ' + String(errMsg);
      box.appendChild(errRow);
    }

    const result = task.result || task;
    if (result) {
      if (typeof result.total_vehicles !== 'undefined') addRow('Vehículos (total)', result.total_vehicles);
      if (typeof result.vehicle_count !== 'undefined') addRow('Vehículos (count)', result.vehicle_count);
      if (typeof result.vehicles !== 'undefined') addRow('Vehículos', result.vehicles);
      if (result.counts && typeof result.counts === 'object') {
        if (typeof result.counts.available !== 'undefined') addRow('Disponibles', result.counts.available);
        if (typeof result.counts.vehicles !== 'undefined') addRow('Contador vehículos', result.counts.vehicles);
      }
      if (Array.isArray(result.detections)) addRow('Detecciones', result.detections.length + ' objetos');
    }

    return box;
  }

  // Upload image and enqueue analysis
  async function onAnalyzeClicked() {
    const file = imageFileInput && imageFileInput.files && imageFileInput.files[0];
    if (!file) { alert('Selecciona una imagen primero'); return; }
    analyzeBtn.disabled = true;
    try {
      const taskId = await analyzeFile(file);
      // add to UI and start polling
      addOrUpdateTaskInList(taskId, 'PENDING');
      pollTask(taskId);
    } catch (e) {
      console.error('Error iniciando análisis', e);
      alert('Error iniciando análisis: ' + e.message);
    } finally {
      analyzeBtn.disabled = false;
    }
  }

  async function analyzeFile(file) {
    const apiBase = getApiBase();
    const url = apiBase + '/analyze';
    const form = new FormData();
    form.append('file', file, file.name);
    let res;
    try {
      res = await fetch(url, { method: 'POST', body: form });
    } catch (networkErr) {
      showDebug('Network error POST /analyze', String(networkErr));
      throw networkErr;
    }
    const contentType = res.headers.get('content-type') || '';
    let data = null;
    if (!res.ok) {
      try {
        if (contentType.includes('application/json')) data = await res.json(); else data = await res.text();
      } catch (e) { data = 'Unable to parse response body'; }
      showDebug('POST /analyze returned error', { status: res.status, statusText: res.statusText, body: data });
      throw new Error(`API error ${res.status} ${res.statusText}`);
    }
    try { data = contentType.includes('application/json') ? await res.json() : null; } catch (e) { data = null; }
    // Show a friendly result summary (not raw JSON)
    showResult('Imagen encolada para procesamiento', data);
    return data.task_id || data.taskId || data.id;
  }

  function addOrUpdateTaskInList(taskId, status) {
    if (!tasksList) return;
    let li = document.getElementById('task-' + taskId);
    if (!li) {
      li = document.createElement('li');
      li.id = 'task-' + taskId;
      const strong = document.createElement('strong');
      strong.textContent = taskId;
      const dash = document.createTextNode(' - ');
      const span = document.createElement('span');
      span.className = 'task-status status-' + (String(status || '').toLowerCase());
      span.textContent = status;
      const detailsBtn = document.createElement('button');
      detailsBtn.className = 'details-btn';
      detailsBtn.textContent = 'Detalles';
      li.appendChild(strong);
      li.appendChild(dash);
      li.appendChild(span);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(detailsBtn);
      tasksList.prepend(li);
      detailsBtn.addEventListener('click', () => { showTaskDetails(taskId); });
    } else {
      const span = li.querySelector('.task-status');
      if (span) {
        span.textContent = status;
        span.className = 'task-status status-' + (String(status || '').toLowerCase());
      }
    }
  }

  // Poll a single task until it completes (used after upload)
  async function pollTask(taskId, interval = 1000) {
    const apiBase = getApiBase();
    const url = apiBase + '/tasks/' + encodeURIComponent(taskId);
    let stopped = false;
    while (!stopped) {
      try {
        const res = await fetch(url);
        if (!res.ok) {
          if (res.status === 404) { addOrUpdateTaskInList(taskId, 'NOT FOUND'); return; }
          throw new Error(res.status + ' ' + res.statusText);
        }
        const data = await res.json();
        const status = (data.status || '').toUpperCase();
        addOrUpdateTaskInList(taskId, status);
        if (status === 'COMPLETED' || status === 'FAILED') {
          stopped = true;
          const result = data.result || data;
          const counters = extractCountersFromResult(result);
          updateCounters(counters);
          // Show unified user-facing summary for both success and failure
          showResult('Resultado del procesamiento', data);
          if (status === 'COMPLETED') {
            videoImg.src = apiBase + `/images/${taskId}/overlay?compressed=true`;
          }
            if (status === 'FAILED') {
              // keep full JSON in debug for diagnosis and show a nice alert to the user
              showDebug('GET /tasks/' + taskId + ' (failed)', data);
              const errMsg = data.error || (data.result && data.result.error) || data.error_message || 'Error desconocido';
              // build friendly element for details and pass it to alert as friendly content
              const friendly = buildResultElement('Detalles', data);
              showAlert('Error procesando imagen', errMsg, friendly);
            }
          break;
        }
      } catch (e) {
        console.error('Polling error', e);
      }
      await new Promise(r => setTimeout(r, interval));
    }
  }

  // Fetch list of tasks (combines memory + disk on the API side)
  async function fetchTasks() {
    const apiBase = getApiBase();
    const url = apiBase + '/tasks?include_disk=true&page=1&page_size=50';
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(res.status + ' ' + res.statusText);
      const data = await res.json();
      const tasks = Array.isArray(data.data) ? data.data : (data || []);
      populateTasksList(tasks);
    } catch (e) {
      console.error('Error fetching tasks', e);
      // Show a friendly alert to the user instead of raw debug output
      try {
        const apiBase = getApiBase();
        const friendlyMsg = 'No se pudo conectar con la API en ' + apiBase + '. Comprueba que el servidor está en ejecución y accesible.';
        showAlert('Error cargando tareas', friendlyMsg, { error: String(e) });
        // show a compact error inside the tasks area as well
        showTasksError('Error cargando tareas', friendlyMsg, { error: String(e) });
      } catch (inner) {
        // fallback to debug if alert creation fails
        showDebug('Error fetching tasks', String(e));
      }
    }
  }

  function populateTasksList(tasks) {
    if (!tasksList) return;
    tasksList.innerHTML = '';
    tasks.forEach(t => {
      const taskId = t.task_id || t.taskId || t.taskId;
      const li = document.createElement('li');
      li.id = 'task-' + taskId;
      const status = (t.status || '').toUpperCase();
      const strong = document.createElement('strong');
      strong.textContent = taskId;
      const dash = document.createTextNode(' - ');
      const span = document.createElement('span');
      span.className = 'task-status status-' + (String(status || '').toLowerCase());
      span.textContent = status;
      const detailsBtn = document.createElement('button');
      detailsBtn.className = 'details-btn';
      detailsBtn.textContent = 'Detalles';
      li.appendChild(strong);
      li.appendChild(dash);
      li.appendChild(span);
      li.appendChild(document.createTextNode(' '));
      li.appendChild(detailsBtn);
      tasksList.appendChild(li);
      detailsBtn.addEventListener('click', () => { showTaskDetails(taskId); });
    });

    // On first load, try to pick a recent completed task (or the most recent)
    // and fetch its details so the counters are initialized from real data.
    if (!initialLoadDone) {
      initialLoadDone = true;
      try {
        let chosen = null;
        for (let i = tasks.length - 1; i >= 0; i--) {
          const t = tasks[i];
          if ((t.status || '').toUpperCase() === 'COMPLETED') { chosen = t; break; }
        }
        if (!chosen && tasks.length > 0) chosen = tasks[0];
        if (chosen) {
          const tid = chosen.task_id || chosen.taskId || chosen.id;
          // If the chosen task already includes a `result` object, use it immediately
          if (chosen.result) {
            try {
              const counters = extractCountersFromResult(chosen.result);
              updateCounters(counters);
            } catch (e) { console.error('apply embedded result to counters failed', e); }
          }
          // Do not auto-show overlays from embedded results on initial load — only show when task becomes COMPLETED
          // Always try to fetch full details (this will update counters if task is completed)
          if (tid) showTaskDetails(tid);
        }
      } catch (e) {
        console.error('init counters from tasks failed', e);
      }
    }
  }

  async function showTaskDetails(taskId) {
    const apiBase = getApiBase();
    const url = apiBase + '/tasks/' + encodeURIComponent(taskId);
    try {
      const res = await fetch(url);
      if (!res.ok) { if (res.status === 404) alert('Task no encontrada'); throw new Error(res.status + ' ' + res.statusText); }
      const data = await res.json();
      // Show friendly task details instead of raw JSON
      showResult('Detalles tarea ' + taskId, data);
      updateTaskStatusInList(taskId, (data.status || '').toUpperCase());
      // Update counters if completed
      if ((data.status || '').toUpperCase() === 'COMPLETED') {
        const result = data.result || data;
        const counters = extractCountersFromResult(result);
        updateCounters(counters);
        // show overlay in main image
        videoImg.style.display = 'block';
        videoImg.src = apiBase + `/images/${taskId}/overlay?compressed=true`;
        // If frames array exists, offer play button
        const frames = result.frames || result.saved_frames || result.saved_frames_list || result.frame_urls || result.frames_urls;
        attachDetailControls(taskId, !!frames, frames);
      } else {
        attachDetailControls(taskId, false, null);
      }
      // show error message if available
      const li = document.getElementById('task-' + taskId);
      if (li) {
        // remove existing error
        let errEl = li.querySelector('.task-error');
        if (errEl) errEl.remove();
        const errMsg = data.error || (data.result && data.result.error) || (data.error_message) || null;
        if (errMsg) {
          errEl = document.createElement('div');
          errEl.className = 'task-error';
          errEl.textContent = String(errMsg);
          li.appendChild(errEl);
        }
      }
    } catch (e) {
      console.error('Error loading task details', e);
    }
  }

  function attachDetailControls(taskId, hasFrames, frames) {
    const li = document.getElementById('task-' + taskId);
    if (!li) return;
    // remove existing controls area
    let controls = li.querySelector('.controls');
    if (controls) controls.remove();
    controls = document.createElement('div');
    controls.className = 'controls';
    const apiBase = getApiBase();
    const overlayBtn = document.createElement('button');
    overlayBtn.textContent = 'Abrir overlay';
    overlayBtn.addEventListener('click', () => window.open(apiBase + `/images/${taskId}/overlay?compressed=true`, '_blank'));
    controls.appendChild(overlayBtn);
    const heatBtn = document.createElement('button');
    heatBtn.textContent = 'Abrir heatmap';
    heatBtn.addEventListener('click', () => window.open(apiBase + `/images/${taskId}/heatmap?compressed=true`, '_blank'));
    controls.appendChild(heatBtn);
    if (hasFrames) {
      const playBtn = document.createElement('button');
      playBtn.textContent = 'Reproducir frames';
      playBtn.addEventListener('click', async () => { playFramesForTask(taskId, frames); });
      controls.appendChild(playBtn);
    }
    li.appendChild(controls);
  }

  async function playFramesForTask(taskId, framesCandidate) {
    const apiBase = getApiBase();
    // If framesCandidate is provided and contains URLs, use them. Otherwise, try to fetch task result to discover frames array paths.
    let frames = framesCandidate;
    if (!frames) {
      try {
        const res = await fetch(apiBase + '/tasks/' + encodeURIComponent(taskId));
        if (!res.ok) throw new Error('no task');
        const data = await res.json();
        const result = data.result || data;
        frames = result.frames || result.saved_frames || result.frame_urls || result.frames_urls || [];
      } catch (e) {
        console.error('No se encontraron frames', e);
        alert('No hay frames disponibles para esta tarea');
        return;
      }
    }
    // Normalize frames: if they are file paths, make them full URLs via apiBase
    if (Array.isArray(frames)) {
      const urls = frames.map(p => {
        if (typeof p !== 'string') return null;
        if (p.startsWith('http')) return p;
        // If path contains outputs/ or storage, try to build a URL
        const cleaned = p.replace(/\\\\/g, '/').replace(/^\//, '');
        return apiBase + '/' + cleaned;
      }).filter(Boolean);
      if (urls.length === 0) { alert('No hay frames válidos'); return; }
      // Play slideshow in main image element
      let idx = 0;
      videoImg.src = urls[0];
      const playInterval = setInterval(() => {
        idx = (idx + 1) % urls.length;
        videoImg.src = urls[idx];
      }, 500);
      // stop after 30s
      setTimeout(() => clearInterval(playInterval), 30000);
    } else {
      alert('Formato de frames desconocido');
    }
  }

  function updateTaskStatusInList(taskId, status) {
    const li = document.getElementById('task-' + taskId);
    if (!li) return;
    const span = li.querySelector('.task-status');
    if (span) {
      span.textContent = status;
      span.className = 'task-status status-' + (String(status || '').toLowerCase());
    }
  }

  function extractCountersFromResult(result) {
    const out = { vehicles: 0, density: 0, cluster: 0 };
    if (!result) return out;

    // Vehicles: try multiple possible fields in order of preference
    if (typeof result.vehicles_detected !== 'undefined') out.vehicles = result.vehicles_detected;
    else if (typeof result.vehicle_count !== 'undefined') out.vehicles = result.vehicle_count;
    else if (typeof result.total_vehicles !== 'undefined') out.vehicles = result.total_vehicles;
    else if (typeof result.vehicles !== 'undefined') out.vehicles = result.vehicles;
    else if (Array.isArray(result.detections)) out.vehicles = result.detections.length;
    else if (result.counts && typeof result.counts === 'object' && typeof result.counts.vehicles !== 'undefined') out.vehicles = result.counts.vehicles;
    else if (typeof result.tracks !== 'undefined') out.vehicles = result.tracks;

    // Density: try explicit density fields or compute from spots_total if available
    if (typeof result.density !== 'undefined') out.density = result.density;
    else if (typeof result.densidad !== 'undefined') out.density = result.densidad;
    else if (typeof result.max_intensity !== 'undefined') out.density = result.max_intensity;
    else if (result.counts && typeof result.counts.available !== 'undefined' && typeof out.vehicles === 'number') {
      // infer density as percent occupied: vehicles / (vehicles + available)
      const avail = Number(result.counts.available) || 0;
      const denom = out.vehicles + avail;
      out.density = denom > 0 ? Math.round((out.vehicles / denom) * 100) : 0;
    } else if (typeof result.spots_total !== 'undefined' && typeof out.vehicles === 'number') {
      const total = Number(result.spots_total) || 0;
      out.density = total > 0 ? Math.round((out.vehicles / total) * 100) : 0;
    }

    // Cluster: try several possible fields
    if (typeof result.cluster !== 'undefined') out.cluster = result.cluster;
    else if (typeof result.clusters !== 'undefined') out.cluster = result.clusters;
    else if (typeof result.cluster_count !== 'undefined') out.cluster = result.cluster_count;
    else if (result.cluster_details && Array.isArray(result.cluster_details)) out.cluster = result.cluster_details.length;
    return out;
  }

  // Initial load: fetch tasks so UI and counters populate
  try { fetchTasks(); } catch (e) { console.error('initial fetchTasks failed', e); }
})();
