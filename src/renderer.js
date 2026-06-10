// Elements
const btnSelectProject = document.getElementById('btn-select-project');
const projectBadge = document.getElementById('project-type-badge');
const routeList = document.getElementById('route-list');

const requestUrl = document.getElementById('request-url');
const requestMethodBadge = document.getElementById('request-method');
const btnSend = document.getElementById('btn-send');

const tabs = document.querySelectorAll('.tab');
const tabPanes = document.querySelectorAll('.tab-pane');

const queryParamsList = document.getElementById('query-params-list');
const pathParamsList = document.getElementById('path-params-list');
const headersList = document.getElementById('headers-list');
const btnAddHeader = document.getElementById('btn-add-header');

const bodyOptions = document.querySelectorAll('input[name="bodyType"]');
const bodyAutoForm = document.getElementById('body-auto-form');
const bodyRawJson = document.getElementById('body-raw-json');

const responseStatus = document.getElementById('response-status');
const responseTime = document.getElementById('response-time');
const responseContent = document.getElementById('response-content');

// State
let currentProject = { path: null, type: null };
let currentRoute = null;

// Initialization
function init() {
  setupEventListeners();
}

function setupEventListeners() {
  btnSelectProject.addEventListener('click', handleSelectProject);
  btnSend.addEventListener('click', handleSendRequest);
  btnAddHeader.addEventListener('click', handleAddHeader);

  tabs.forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  bodyOptions.forEach(radio => {
    radio.addEventListener('change', (e) => switchBodyType(e.target.value));
  });

  // Setup initial remove button for header
  const initialRemoveBtn = headersList.querySelector('.btn-remove');
  if (initialRemoveBtn) {
    initialRemoveBtn.addEventListener('click', (e) => e.target.closest('.kv-row').remove());
  }
}

// Actions
async function handleSelectProject() {
  const folderPath = await window.electronAPI.selectFolder();
  if (!folderPath) return;

  const type = await window.electronAPI.detectProject(folderPath);
  
  if (type === 'other') {
    alert("Could not detect a Next.js or Express project in this folder.");
    return;
  }

  currentProject = { path: folderPath, type };
  projectBadge.textContent = type.toUpperCase();
  projectBadge.classList.remove('hidden');

  loadRoutes();
}

async function loadRoutes() {
  routeList.innerHTML = '<li class="empty-state">Scanning...</li>';
  
  const routes = await window.electronAPI.scanRoutes(currentProject.path, currentProject.type);
  
  if (routes.length === 0) {
    routeList.innerHTML = '<li class="empty-state">No routes found.</li>';
    return;
  }

  routeList.innerHTML = '';
  
  routes.forEach(route => {
    const li = document.createElement('li');
    li.innerHTML = `
      <span class="route-method method-${route.method}">${route.method}</span>
      <span class="route-path" title="${route.path}">${route.path}</span>
    `;
    li.addEventListener('click', () => selectRoute(route, li));
    routeList.appendChild(li);
  });
}

async function selectRoute(route, liElement) {
  // Highlight active
  document.querySelectorAll('.route-list li').forEach(li => li.classList.remove('active'));
  liElement.classList.add('active');

  currentRoute = route;
  requestUrl.value = `http://localhost:3000${route.path}`; // Default to localhost:3000
  requestMethodBadge.textContent = route.method;
  requestMethodBadge.className = `method-badge method-${route.method}`;

  // Reset inputs
  queryParamsList.innerHTML = '<div class="empty-hint">Loading...</div>';
  pathParamsList.innerHTML = '<div class="empty-hint">Loading...</div>';
  bodyAutoForm.innerHTML = '<div class="empty-hint">Loading...</div>';

  // Detect Parameters
  const params = await window.electronAPI.detectParams(route.file, route.method, currentProject.type);
  
  renderParams(params.query, queryParamsList, 'Query Parameter');
  renderParams(params.params, pathParamsList, 'Path Variable');
  renderParams(params.body, bodyAutoForm, 'Body Field');

  // Auto-switch body type if there are body params
  if (params.body.length > 0) {
    document.querySelector('input[value="form"]').checked = true;
    switchBodyType('form');
  } else {
    document.querySelector('input[value="none"]').checked = true;
    switchBodyType('none');
  }
}

function renderParams(paramList, container, placeholderSuffix) {
  if (paramList.length === 0) {
    container.innerHTML = `<div class="empty-hint">No ${placeholderSuffix.toLowerCase()}s detected.</div>`;
    return;
  }

  container.innerHTML = '';
  paramList.forEach(paramName => {
    const row = document.createElement('div');
    row.className = 'kv-row';
    row.innerHTML = `
      <input type="text" class="kv-key" value="${paramName}" readonly style="background: rgba(0,0,0,0.2)">
      <input type="text" class="kv-val" placeholder="Value for ${paramName}">
    `;
    container.appendChild(row);
  });
}

function handleAddHeader() {
  const row = document.createElement('div');
  row.className = 'kv-row';
  row.innerHTML = `
    <input type="text" class="kv-key" placeholder="Key (e.g., Authorization)">
    <input type="text" class="kv-val" placeholder="Value (e.g., Bearer ...)">
    <button class="btn-remove">x</button>
  `;
  row.querySelector('.btn-remove').addEventListener('click', (e) => e.target.closest('.kv-row').remove());
  headersList.appendChild(row);
}

// Execute Request
async function handleSendRequest() {
  if (!currentRoute && !requestUrl.value) return;

  btnSend.textContent = 'Sending...';
  btnSend.disabled = true;

  try {
    // Collect Data
    const pathParams = collectKeyValue(pathParamsList);
    const queryParams = collectKeyValue(queryParamsList);
    const headers = collectKeyValue(headersList);
    
    let body = null;
    const bodyType = document.querySelector('input[name="bodyType"]:checked').value;
    if (bodyType === 'json') {
      try {
        body = bodyRawJson.value ? JSON.parse(bodyRawJson.value) : {};
      } catch(e) {
        alert("Invalid JSON in raw body editor.");
        return;
      }
    } else if (bodyType === 'form') {
      body = collectKeyValue(bodyAutoForm);
    }

    const requestData = {
      url: requestUrl.value,
      method: requestMethodBadge.textContent,
      pathParams,
      queryParams,
      headers,
      body
    };

    // Send
    responseContent.textContent = 'Waiting for response...';
    responseStatus.textContent = 'Status: ---';
    responseTime.textContent = 'Time: --- ms';

    const result = await window.electronAPI.sendRequest(requestData);

    // Render Response
    if (result.success) {
      responseStatus.textContent = `Status: ${result.status} ${result.statusText}`;
      // Colorize status
      responseStatus.style.color = result.status >= 200 && result.status < 300 ? 'var(--success)' : 'var(--danger)';
    } else {
      responseStatus.textContent = `Error: Network / Parsing`;
      responseStatus.style.color = 'var(--danger)';
    }

    responseTime.textContent = `Time: ${result.timeTaken || 'N/A'}`;
    
    if (typeof result.data === 'object') {
      responseContent.textContent = JSON.stringify(result.data, null, 2);
    } else {
      responseContent.textContent = result.data || result.error || "No response data.";
    }

  } catch (err) {
    responseContent.textContent = `Execution Error: ${err.message}`;
  } finally {
    btnSend.textContent = 'Send';
    btnSend.disabled = false;
  }
}

// Helpers
function collectKeyValue(container) {
  const result = {};
  const rows = container.querySelectorAll('.kv-row');
  rows.forEach(row => {
    const key = row.querySelector('.kv-key').value.trim();
    const val = row.querySelector('.kv-val').value.trim();
    if (key && val) {
      result[key] = val;
    }
  });
  return result;
}

function switchTab(tabId) {
  tabs.forEach(t => t.classList.remove('active'));
  tabPanes.forEach(p => p.classList.remove('active'));

  document.querySelector(`.tab[data-tab="${tabId}"]`).classList.add('active');
  document.getElementById(`tab-${tabId}`).classList.add('active');
}

function switchBodyType(type) {
  bodyAutoForm.classList.add('hidden');
  bodyRawJson.classList.add('hidden');
  
  if (type === 'form') bodyAutoForm.classList.remove('hidden');
  if (type === 'json') bodyRawJson.classList.remove('hidden');
}

// Run
init();
