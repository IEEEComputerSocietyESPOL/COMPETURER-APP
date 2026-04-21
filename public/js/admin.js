// ============================================================
// ADMIN PANEL LOGIC
// ============================================================
let adminAuthed = false;
let adminToken  = sessionStorage.getItem('admin_token') || null;

// ── Helper: fetch autenticado ─────────────────────────────
// Todas las llamadas a rutas protegidas deben usar authFetch.
async function authFetch(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...options.headers };
  if (adminToken) headers['Authorization'] = `Bearer ${adminToken}`;
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    // Token expirado o inválido → forzar logout
    adminLogout();
    showToast('⏱ Sesión expirada. Inicia sesión nuevamente.', 'error');
    throw new Error('No autenticado');
  }
  return res;
}

// ── Auth ──────────────────────────────────────────────────
async function adminLogin() {
  const u = document.getElementById('au').value.trim();
  const p = document.getElementById('ap').value;
  
  try {
    const res = await fetch('/api/auth/admin-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: u, password: p })
    });
    
    if (res.ok) {
      const data = await res.json();
      adminToken  = data.token;
      adminAuthed = true;
      sessionStorage.setItem('admin_token', adminToken);
      document.getElementById('admin-login').style.display = 'none';
      document.getElementById('admin-panel').style.display = 'block';
      loadAdminData();
      showToast(`✅ Bienvenido, ${data.admin.username}`, 'success');
    } else {
      const err = await res.json().catch(() => ({}));
      showToast('❌ ' + (err.error || 'Credenciales incorrectas'), 'error');
    }
  } catch (e) {
    showToast('Error de conexión', 'error');
  }
}

// Auto-restaurar sesión si hay token guardado
window.addEventListener('DOMContentLoaded', () => {
  if (adminToken) {
    adminAuthed = true;
    document.getElementById('admin-login').style.display = 'none';
    document.getElementById('admin-panel').style.display = 'block';
    loadAdminData();
  }
});

document.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !adminAuthed) adminLogin();
});

function adminLogout() {
  adminAuthed = false;
  adminToken  = null;
  sessionStorage.removeItem('admin_token');
  document.getElementById('admin-login').style.display = 'flex';
  document.getElementById('admin-panel').style.display = 'none';
  document.getElementById('au').value = '';
  document.getElementById('ap').value = '';
}

// ── Tab navigation ─────────────────────────────────────────
function adminTab(name) {
  document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.admin-page').forEach(p => p.classList.remove('active'));

  const tabs = ['config','admins','teams','categories','challenges','ranking'];
  document.querySelectorAll('.admin-tab')[tabs.indexOf(name)]?.classList.add('active');
  document.getElementById(`ap-${name}`)?.classList.add('active');

  if (name === 'admins')     renderAdminsTable();
  if (name === 'teams')      renderTeamsTable();
  if (name === 'categories') renderCatsTable();
  if (name === 'challenges') { populateCatFilter(); renderChallengesTable(); }
  if (name === 'ranking')    renderAdminRanking();
}

// ── Load initial data ─────────────────────────────────────
async function loadAdminData() {
  const cfg = await Store.getConfig();
  document.getElementById('cfg-title').value = cfg.title || '';
  document.getElementById('admin-platform-name').textContent = cfg.title || 'IEEE Hackathon';

  if (cfg.endTime) {
    const d = new Date(cfg.endTime);
    const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
    document.getElementById('cfg-endtime').value = local;
  }

  // Cargar logo existente
  if (cfg.logo) {
    const isBase64 = cfg.logo.startsWith('data:');
    if (isBase64) {
      document.getElementById('cfg-logo-data').value = cfg.logo;
      showLogoPreview(cfg.logo, 'Imagen subida');
    } else {
      document.getElementById('cfg-logo').value = cfg.logo;
      showLogoPreview(cfg.logo, cfg.logo);
    }
  }
}

// ── Config ────────────────────────────────────────────────
async function saveConfig() {
  const title      = document.getElementById('cfg-title').value.trim();
  const endTimeRaw = document.getElementById('cfg-endtime').value;

  // Logo: base64 tiene prioridad sobre URL
  const logoData = document.getElementById('cfg-logo-data').value.trim();
  const logoUrl  = document.getElementById('cfg-logo').value.trim();
  const logo     = logoData || logoUrl || null;

  const updates = { title, logo };
  if (endTimeRaw) updates.endTime = new Date(endTimeRaw).toISOString();
  else updates.endTime = null;

  await Store.updateConfig(updates);
  document.getElementById('admin-platform-name').textContent = title || 'IEEE Hackathon';
  showToast('✅ Configuración guardada', 'success');
}

// ── Logo upload helpers ───────────────────────────────────
function handleLogoUpload(input) {
  const file = input.files[0];
  if (!file) return;
  if (file.size > 2 * 1024 * 1024) {
    showToast('❌ Imagen demasiado grande (máx. 2MB)', 'error');
    input.value = '';
    return;
  }
  const reader = new FileReader();
  reader.onload = (e) => {
    const base64 = e.target.result;
    document.getElementById('cfg-logo-data').value = base64;
    document.getElementById('cfg-logo').value = '';   // limpiar URL
    showLogoPreview(base64, file.name);
  };
  reader.readAsDataURL(file);
}

function handleLogoUrl(url) {
  if (!url) { clearLogo(); return; }
  // Si se escribe una URL, limpiar el base64
  document.getElementById('cfg-logo-data').value = '';
  showLogoPreview(url, url);
}

function showLogoPreview(src, label) {
  const wrap = document.getElementById('logo-preview-wrap');
  const img  = document.getElementById('logo-preview-img');
  const name = document.getElementById('logo-preview-name');
  img.src  = src;
  name.textContent = label.length > 50 ? label.slice(0, 47) + '...' : label;
  wrap.style.display = 'block';
}

function clearLogo() {
  document.getElementById('cfg-logo').value      = '';
  document.getElementById('cfg-logo-data').value = '';
  document.getElementById('cfg-logo-file').value = '';
  document.getElementById('logo-preview-wrap').style.display = 'none';
  document.getElementById('logo-preview-img').src = '';
}
// ── ADMINS ────────────────────────────────────────────────
async function renderAdminsTable() {
  const res    = await authFetch('/api/admins');
  const admins = await res.json();
  const wrap  = document.getElementById('admins-table-wrap');

  if (!admins.length) {
    wrap.innerHTML = '<p style="color:var(--text-muted); padding:24px; text-align:center;">No hay administradores.</p>';
    return;
  }

  const rows = admins.map(a => `
    <tr>
      <td class="check-col"><input type="checkbox" class="bulk-cb" data-id="${a.id}" onchange="updateBulkBar('admins-table-wrap')" /></td>
      <td style="color:var(--text-primary); font-weight:600;">👤 ${escHtml(a.username)}</td>
      <td style="color:var(--text-muted); font-size:0.78rem;">ID: ${a.id.substring(0, 8)}...</td>
      <td>
        <div class="inline-btns">
          <button class="mini-btn" onclick="openAdminModal('${a.id}')">✏ Editar</button>
          <button class="mini-btn danger" onclick="deleteAdmin('${a.id}','${escHtml(a.username)}')">🗑</button>
        </div>
      </td>
    </tr>`).join('');

  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th class="check-col"><input type="checkbox" class="bulk-cb-all" onchange="toggleAllCheckboxes('admins-table-wrap', this.checked)" /></th>
        <th>Usuario</th><th>ID</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${bulkBarHtml('admins-table-wrap', 'admins')}`;
}

async function openAdminModal(adminId = null) {
  let admin = null;
  if (adminId) {
    const res    = await authFetch('/api/admins');
    const admins = await res.json();
    admin = admins.find(a => a.id === adminId);
  }

  showModal(`
    <div class="modal-title">${admin ? '✏ Editar Admin' : '+ Nuevo Admin'}</div>
    <div class="form-group">
      <label class="form-label">Usuario *</label>
      <input id="m-admin-user" type="text" class="form-input" value="${escHtml(admin?.username || '')}" placeholder="admin2" ${admin ? 'disabled' : ''} />
      <small style="color:var(--text-muted); font-size:0.7rem;">No se puede cambiar después de crear</small>
    </div>
    <div class="form-group">
      <label class="form-label">Contraseña ${admin ? '(dejar vacío para mantener)' : '*'}</label>
      <input id="m-admin-pass" type="password" class="form-input" placeholder="••••••••" />
    </div>
    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveAdmin('${adminId || ''}')">💾 Guardar</button>
    </div>`);
}

async function saveAdmin(adminId) {
  const username = document.getElementById('m-admin-user').value.trim();
  const password = document.getElementById('m-admin-pass').value;

  if (!adminId && !username) {
    showToast('El usuario es requerido', 'error');
    return;
  }
  if (!adminId && !password) {
    showToast('La contraseña es requerida', 'error');
    return;
  }

  try {
    if (adminId) {
      // Actualizar
      if (!password) {
        showToast('Ingresa una nueva contraseña', 'error');
        return;
      }
      const res = await authFetch(`/api/admins/${adminId}`, {
        method: 'PATCH',
        body: JSON.stringify({ password })
      });
      if (!res.ok) throw new Error('Error al actualizar');
      showToast('✅ Admin actualizado', 'success');
    } else {
      // Crear
      const res = await authFetch('/api/admins', {
        method: 'POST',
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Error al crear');
      }
      showToast('✅ Admin creado', 'success');
    }
    closeModal();
    renderAdminsTable();
  } catch (e) {
    showToast('❌ ' + e.message, 'error');
  }
}

async function deleteAdmin(id, username) {
  if (!confirm(`¿Eliminar admin "${username}"? (debe haber al menos un admin)`)) return;
  try {
    const res = await authFetch(`/api/admins/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || 'Error');
    }
    renderAdminsTable();
    showToast('✅ Admin eliminado', 'success');
  } catch (e) {
    showToast('❌ ' + e.message, 'error');
  }
}

// ── TEAMS ─────────────────────────────────────────────────
async function renderTeamsTable() {
  const teams = await Store.getTeams();
  const wrap  = document.getElementById('teams-table-wrap');

  if (!teams.length) {
    wrap.innerHTML = '<p style="color:var(--text-muted); padding:24px; text-align:center;">No hay equipos registrados.</p>';
    return;
  }

  const rows = teams.map(t => `
    <tr>
      <td class="check-col"><input type="checkbox" class="bulk-cb" data-id="${t.id}" onchange="updateBulkBar('teams-table-wrap')" /></td>
      <td style="color:var(--text-primary); font-weight:600;">${escHtml(t.name)}</td>
      <td style="color:var(--text-muted); font-size:0.78rem;">${(t.members || []).join(', ') || '—'}</td>
      <td><span style="color:var(--cyan); font-family:var(--font-display); font-weight:700;">${t.score ?? 0}</span></td>
      <td>${t.completedChallenges?.length || 0} completados</td>
      <td>
        <div class="inline-btns">
          <button class="mini-btn" onclick="openTeamModal('${t.id}')">✏ Editar</button>
          <button class="mini-btn danger" onclick="deleteTeam('${t.id}','${escHtml(t.name)}')">🗑</button>
          <button class="mini-btn" onclick="resetTeamProgress('${t.id}')">↺ Reset</button>
        </div>
      </td>
    </tr>`).join('');

  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th class="check-col"><input type="checkbox" class="bulk-cb-all" onchange="toggleAllCheckboxes('teams-table-wrap', this.checked)" /></th>
        <th>Nombre</th><th>Integrantes</th><th>Puntaje</th><th>Progreso</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${bulkBarHtml('teams-table-wrap', 'teams')}`;
}

async function openTeamModal(teamId = null) {
  const teams = await Store.getTeams();
  const team  = teamId ? teams.find(t => t.id === teamId) : null;

  showModal(`
    <div class="modal-title">${team ? '✏ Editar Equipo' : '+ Nuevo Equipo'}</div>
    <div class="form-group">
      <label class="form-label">Nombre del Equipo *</label>
      <input id="m-team-name" type="text" class="form-input" value="${escHtml(team?.name || '')}" placeholder="Team Alpha" />
    </div>
    <div class="form-group">
      <label class="form-label">Contraseña del Equipo *</label>
      <input id="m-team-password" type="password" class="form-input" value="${escHtml(team?.password || '')}" placeholder="Contraseña segura" />
      <small style="color:var(--text-muted); font-size:0.7rem;">Los miembros usarán esta contraseña para entrar</small>
    </div>
    <div class="form-group">
      <label class="form-label">Integrantes (separados por coma)</label>
      <input id="m-team-members" type="text" class="form-input" value="${escHtml((team?.members || []).join(', '))}" placeholder="Juan, María, Carlos" />
    </div>
    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveTeam('${teamId || ''}')">💾 Guardar</button>
    </div>`);
}

async function saveTeam(teamId) {
  const name = document.getElementById('m-team-name').value.trim();
  const password = document.getElementById('m-team-password').value.trim();
  if (!name) { showToast('El nombre es requerido', 'error'); return; }
  if (!password) { showToast('La contraseña es requerida', 'error'); return; }

  const members = document.getElementById('m-team-members').value
    .split(',').map(s => s.trim()).filter(Boolean);

  const teams    = await Store.getTeams();
  const existing = teamId ? teams.find(t => t.id === teamId) : null;
  const team = existing
    ? { ...existing, name, password, members }
    : { id: genId(), name, password, members, score: 0, completedChallenges: [] };

  await Store.saveTeam(team);
  closeModal();
  renderTeamsTable();
  showToast(`✅ Equipo "${name}" guardado`, 'success');
}

async function deleteTeam(id, name) {
  if (!confirm(`¿Eliminar equipo "${name}"?`)) return;
  await Store.deleteTeam(id);
  renderTeamsTable();
  showToast('Equipo eliminado', 'info');
}

async function resetTeamProgress(id) {
  if (!confirm('¿Resetear todo el progreso y puntaje de este equipo?')) return;
  const teams = await Store.getTeams();
  const team  = teams.find(t => t.id === id);
  if (!team) return;
  team.score = 0;
  team.completedChallenges = [];
  await Store.saveTeam(team);
  renderTeamsTable();
  showToast('Progreso reseteado', 'info');
}

// ── CATEGORIES ────────────────────────────────────────────
const CAT_COLORS = ['#00f5ff','#ff6b35','#ffd700','#00ff87','#c084fc','#ff00aa','#60a5fa','#f472b6'];
const CAT_ICONS  = ['⚡','🔷','🏆','🎯','🔥','💡','🚀','🔐','📐','🌐','🧬','🤖'];

async function renderCatsTable() {
  const cats = await Store.getCategories();
  const wrap = document.getElementById('cats-table-wrap');

  if (!cats.length) {
    wrap.innerHTML = '<p style="color:var(--text-muted); padding:24px; text-align:center;">No hay categorías.</p>';
    return;
  }

  const rows = cats.map(c => `
    <tr>
      <td class="check-col"><input type="checkbox" class="bulk-cb" data-id="${c.id}" onchange="updateBulkBar('cats-table-wrap')" /></td>
      <td><span style="font-size:20px;">${c.icon || '📁'}</span></td>
      <td><span style="color:${c.color}; font-weight:600;">${escHtml(c.name)}</span></td>
      <td>${(c.challenges || []).length} desafíos</td>
      <td>
        <div class="inline-btns">
          <button class="mini-btn" onclick="openCatModal('${c.id}')">✏ Editar</button>
          <button class="mini-btn danger" onclick="deleteCat('${c.id}','${escHtml(c.name)}')">🗑</button>
        </div>
      </td>
    </tr>`).join('');

  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th class="check-col"><input type="checkbox" class="bulk-cb-all" onchange="toggleAllCheckboxes('cats-table-wrap', this.checked)" /></th>
        <th>Icono</th><th>Nombre</th><th>Desafíos</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows}</tbody>
    </table>
    ${bulkBarHtml('cats-table-wrap', 'categories')}`;
}

async function openCatModal(catId = null) {
  const cats = await Store.getCategories();
  const cat  = catId ? cats.find(c => c.id === catId) : null;

  const colorOpts = CAT_COLORS.map(c =>
    `<div class="color-opt ${cat?.color === c ? 'selected' : ''}" style="background:${c};" onclick="selectCatColor(this,'${c}')" data-color="${c}"></div>`
  ).join('');

  const iconOpts = CAT_ICONS.map(ic =>
    `<div class="color-opt ${cat?.icon === ic ? 'selected' : ''}" style="background:var(--bg-card2); font-size:16px; display:flex; align-items:center; justify-content:center;" onclick="selectCatIcon(this,'${ic}')" data-icon="${ic}">${ic}</div>`
  ).join('');

  showModal(`
    <div class="modal-title">${cat ? '✏ Editar Categoría' : '+ Nueva Categoría'}</div>
    <div class="form-group">
      <label class="form-label">Nombre *</label>
      <input id="m-cat-name" type="text" class="form-input" value="${escHtml(cat?.name || '')}" placeholder="Algoritmia" />
    </div>
    <div class="form-group">
      <label class="form-label">Color</label>
      <input type="hidden" id="m-cat-color" value="${cat?.color || CAT_COLORS[0]}" />
      <div class="color-grid">${colorOpts}</div>
    </div>
    <div class="form-group">
      <label class="form-label">Icono</label>
      <input type="hidden" id="m-cat-icon" value="${cat?.icon || CAT_ICONS[0]}" />
      <div class="color-grid">${iconOpts}</div>
    </div>
    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveCat('${catId || ''}')">💾 Guardar</button>
    </div>`);
}

function selectCatColor(el, color) {
  document.querySelectorAll('.color-opt[data-color]').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('m-cat-color').value = color;
}

function selectCatIcon(el, icon) {
  document.querySelectorAll('.color-opt[data-icon]').forEach(e => e.classList.remove('selected'));
  el.classList.add('selected');
  document.getElementById('m-cat-icon').value = icon;
}

async function saveCat(catId) {
  const name  = document.getElementById('m-cat-name').value.trim();
  if (!name) { showToast('El nombre es requerido', 'error'); return; }

  const color = document.getElementById('m-cat-color').value;
  const icon  = document.getElementById('m-cat-icon').value;
  const cats  = await Store.getCategories();
  const existing = catId ? cats.find(c => c.id === catId) : null;
  const cat = existing
    ? { ...existing, name, color, icon }
    : { id: genId(), name, color, icon, challenges: [] };

  await Store.saveCategory(cat);
  closeModal();
  renderCatsTable();
  populateCatFilter();
  showToast(`✅ Categoría "${name}" guardada`, 'success');
}

async function deleteCat(id, name) {
  if (!confirm(`¿Eliminar categoría "${name}" y todos sus desafíos?`)) return;
  await Store.deleteCategory(id);
  renderCatsTable();
  renderChallengesTable();
  showToast('Categoría eliminada', 'info');
}

// ── CHALLENGES ────────────────────────────────────────────
async function populateCatFilter() {
  const select = document.getElementById('cat-filter');
  const cats   = await Store.getCategories();
  const current = select.value;
  select.innerHTML = '<option value="">Todas las categorías</option>' +
    cats.map(c => `<option value="${c.id}" ${current === c.id ? 'selected' : ''}>${c.icon} ${c.name}</option>`).join('');
}

async function renderChallengesTable() {
  const filterCat = document.getElementById('cat-filter').value;
  const cats  = await Store.getCategories();
  const wrap  = document.getElementById('challenges-table-wrap');
  const rows  = [];

  cats.forEach(cat => {
    if (filterCat && cat.id !== filterCat) return;
    (cat.challenges || []).forEach(ch => {
      const diff = DIFFICULTY[ch.difficulty] || DIFFICULTY.basic;
      rows.push(`
        <tr>
          <td class="check-col"><input type="checkbox" class="bulk-cb" data-id="${cat.id}::${ch.id}" onchange="updateBulkBar('challenges-table-wrap')" /></td>
          <td><span class="cat-badge" style="color:${cat.color}; border-color:${cat.color}40;">${cat.icon} ${escHtml(cat.name)}</span></td>
          <td style="color:var(--text-primary); font-weight:600;">${escHtml(ch.title)}</td>
          <td><span class="diff-badge" style="color:${diff.color}; border-color:${diff.color}; background:${diff.color}18;">${diff.label}</span></td>
          <td style="color:var(--cyan);">${diff.points} pts</td>
          <td>${(ch.hiddenTests || []).length} tests ocultos</td>
          <td>
            <div class="inline-btns">
              <button class="mini-btn" onclick="openChallengeModal('${cat.id}','${ch.id}')">✏ Editar</button>
              <button class="mini-btn danger" onclick="deleteChallenge('${cat.id}','${ch.id}','${escHtml(ch.title)}')">🗑</button>
            </div>
          </td>
        </tr>`);
    });
  });

  if (!rows.length) {
    wrap.innerHTML = '<p style="color:var(--text-muted); padding:24px; text-align:center;">No hay desafíos. Crea una categoría primero.</p>';
    return;
  }

  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr>
        <th class="check-col"><input type="checkbox" class="bulk-cb-all" onchange="toggleAllCheckboxes('challenges-table-wrap', this.checked)" /></th>
        <th>Categoría</th><th>Título</th><th>Dificultad</th><th>Puntos</th><th>Tests</th><th>Acciones</th>
      </tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table>
    ${bulkBarHtml('challenges-table-wrap', 'challenges')}`;
}

async function openChallengeModal(catId = null, challengeId = null) {
  const cats = await Store.getCategories();
  if (!cats.length) { showToast('Crea una categoría primero', 'error'); return; }

  const ch = catId && challengeId
    ? cats.find(c => c.id === catId)?.challenges.find(ch => ch.id === challengeId)
    : null;

  const existingCatId = catId || cats[0].id;

  const catOptions = cats.map(c =>
    `<option value="${c.id}" ${c.id === existingCatId ? 'selected' : ''}>${c.icon} ${c.name}</option>`
  ).join('');

  const exHtml = (ch?.examples || [{input:'',output:''},{input:'',output:''}]).map((ex, i) => `
    <div class="ex-row" style="display:grid; grid-template-columns:1fr 1fr auto; gap:8px; margin-bottom:8px; align-items:start;">
      <div>
        <label class="form-label" style="font-size:0.6rem;">Input ${i+1}</label>
        <textarea class="form-textarea ch-ex-in" style="min-height:60px;" placeholder="Entrada de ejemplo">${escHtml(ex.input)}</textarea>
      </div>
      <div>
        <label class="form-label" style="font-size:0.6rem;">Output ${i+1}</label>
        <textarea class="form-textarea ch-ex-out" style="min-height:60px;" placeholder="Salida esperada">${escHtml(ex.output)}</textarea>
      </div>
      <button type="button" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:18px; padding:4px; margin-top:18px;" onclick="this.closest('.ex-row').remove()">×</button>
    </div>`).join('');

  const hiddenHtml = (ch?.hiddenTests || Array(4).fill({input:'',output:''})).map((t, i) => `
    <div class="test-row">
      <textarea class="form-textarea ch-hidden-in" style="min-height:50px; font-size:0.75rem;" placeholder="Input ${i+1}">${escHtml(t.input)}</textarea>
      <textarea class="form-textarea ch-hidden-out" style="min-height:50px; font-size:0.75rem;" placeholder="Output ${i+1}">${escHtml(t.output)}</textarea>
      <button type="button" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:18px; padding:4px;" onclick="this.closest('.test-row').remove()">×</button>
    </div>`).join('');

  showModal(`
    <div class="modal-title">${ch ? '✏ Editar Desafío' : '+ Nuevo Desafío'}</div>
    <div class="form-group">
      <label class="form-label">Categoría *</label>
      <select id="m-ch-cat" class="form-select">${catOptions}</select>
    </div>
    <div class="form-group">
      <label class="form-label">Título *</label>
      <input id="m-ch-title" type="text" class="form-input" value="${escHtml(ch?.title || '')}" placeholder="Suma de Arrays" />
    </div>
    <div class="form-group">
      <label class="form-label">Dificultad *</label>
      <select id="m-ch-diff" class="form-select diff-select">
        <option value="basic" ${ch?.difficulty==='basic'?'selected':''}>⭐ Básico (1 pt)</option>
        <option value="medium" ${ch?.difficulty==='medium'?'selected':''}>⭐⭐ Medio (2 pts)</option>
        <option value="hard" ${ch?.difficulty==='hard'?'selected':''}>⭐⭐⭐ Difícil (3 pts)</option>
        <option value="ieee-master" ${ch?.difficulty==='ieee-master'?'selected':''}>👑 IEEE Master (5 pts)</option>
      </select>
    </div>
    <div class="form-group">
      <label class="form-label">Descripción del Problema *</label>
      <textarea id="m-ch-desc" class="form-textarea" style="min-height:100px;" placeholder="Describe el problema...">${escHtml(ch?.description || '')}</textarea>
    </div>
    <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;">
      <div class="form-group">
        <label class="form-label">Formato de Entrada</label>
        <textarea id="m-ch-infmt" class="form-textarea" style="min-height:70px;">${escHtml(ch?.inputFormat || '')}</textarea>
      </div>
      <div class="form-group">
        <label class="form-label">Formato de Salida</label>
        <textarea id="m-ch-outfmt" class="form-textarea" style="min-height:70px;">${escHtml(ch?.outputFormat || '')}</textarea>
      </div>
    </div>
    <div class="form-group">
      <label class="form-label">Ejemplos Visibles (máx. 3)</label>
      <div id="examples-wrap">${exHtml}</div>
      <button type="button" class="mini-btn" style="margin-top:6px;" onclick="addExample()">+ Agregar ejemplo</button>
    </div>
    <div class="form-group">
      <label class="form-label">Tests Ocultos (hasta 6) — No visibles para los participantes</label>
      <div id="hidden-tests-wrap">${hiddenHtml}</div>
      <button type="button" class="mini-btn" style="margin-top:6px;" onclick="addHiddenTest()">+ Agregar test oculto</button>
    </div>
    <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
      <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
      <button class="btn btn-primary" onclick="saveChallenge('${existingCatId}','${challengeId || ''}')">💾 Guardar Desafío</button>
    </div>`, true);
}

function addExample() {
  const wrap = document.getElementById('examples-wrap');
  const i = wrap.querySelectorAll('.ch-ex-in').length + 1;
  if (i > 3) { showToast('Máximo 3 ejemplos visibles', 'info'); return; }
  const div = document.createElement('div');
  div.className = 'ex-row';
  div.style.cssText = 'display:grid; grid-template-columns:1fr 1fr auto; gap:8px; margin-bottom:8px; align-items:start;';
  div.innerHTML = `
    <div>
      <label class="form-label" style="font-size:0.6rem;">Input ${i}</label>
      <textarea class="form-textarea ch-ex-in" style="min-height:60px;" placeholder="Entrada de ejemplo"></textarea>
    </div>
    <div>
      <label class="form-label" style="font-size:0.6rem;">Output ${i}</label>
      <textarea class="form-textarea ch-ex-out" style="min-height:60px;" placeholder="Salida de ejemplo"></textarea>
    </div>
    <button type="button" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:18px; padding:4px; margin-top:18px;" onclick="this.closest('.ex-row').remove()">×</button>`;
  wrap.appendChild(div);
}

function addHiddenTest() {
  const wrap  = document.getElementById('hidden-tests-wrap');
  const count = wrap.querySelectorAll('.ch-hidden-in').length;
  if (count >= 6) { showToast('Máximo 6 tests ocultos', 'info'); return; }
  const div = document.createElement('div');
  div.className = 'test-row';
  div.innerHTML = `
    <textarea class="form-textarea ch-hidden-in" style="min-height:50px; font-size:0.75rem;" placeholder="Input ${count + 1}"></textarea>
    <textarea class="form-textarea ch-hidden-out" style="min-height:50px; font-size:0.75rem;" placeholder="Output ${count + 1}"></textarea>
    <button type="button" style="background:none; border:none; color:var(--red); cursor:pointer; font-size:18px; padding:4px;" onclick="this.closest('.test-row').remove()">×</button>`;
  wrap.appendChild(div);
}

async function saveChallenge(originalCatId, challengeId) {
  const newCatId      = document.getElementById('m-ch-cat').value;
  const title         = document.getElementById('m-ch-title').value.trim();
  const difficulty    = document.getElementById('m-ch-diff').value;
  const description   = document.getElementById('m-ch-desc').value.trim();
  const inputFormat   = document.getElementById('m-ch-infmt').value.trim();
  const outputFormat  = document.getElementById('m-ch-outfmt').value.trim();

  if (!title || !description) { showToast('Título y descripción son requeridos', 'error'); return; }

  const exInputs  = [...document.querySelectorAll('.ch-ex-in')].map(el => el.value.trim());
  const exOutputs = [...document.querySelectorAll('.ch-ex-out')].map(el => el.value.trim());
  const examples  = exInputs.map((inp, i) => ({ input: inp, output: exOutputs[i] || '' })).filter(e => e.input);

  const hidInputs  = [...document.querySelectorAll('.ch-hidden-in')].map(el => el.value.trim());
  const hidOutputs = [...document.querySelectorAll('.ch-hidden-out')].map(el => el.value.trim());
  const hiddenTests = hidInputs.map((inp, i) => ({ input: inp, output: hidOutputs[i] || '' })).filter(e => e.input);

  const challenge = {
    id: challengeId || genId(),
    title, difficulty, description, inputFormat, outputFormat, examples, hiddenTests
  };

  if (challengeId && originalCatId !== newCatId) {
    await Store.deleteChallenge(originalCatId, challengeId);
  }

  await Store.saveChallenge(newCatId, challenge);
  closeModal();
  renderChallengesTable();
  showToast(`✅ Desafío "${title}" guardado`, 'success');
}

async function deleteChallenge(catId, challengeId, title) {
  if (!confirm(`¿Eliminar desafío "${title}"?`)) return;
  await Store.deleteChallenge(catId, challengeId);
  renderChallengesTable();
  showToast('Desafío eliminado', 'info');
}

// ── ADMIN RANKING ─────────────────────────────────────────
async function renderAdminRanking() {
  const teams  = (await Store.getTeams()).sort((a, b) => (b.score || 0) - (a.score || 0));
  const cats   = await Store.getCategories();
  const totalCh = cats.reduce((s, c) => s + (c.challenges?.length || 0), 0);
  const wrap   = document.getElementById('admin-ranking-wrap');

  if (!teams.length) {
    wrap.innerHTML = '<p style="color:var(--text-muted); padding:24px; text-align:center;">Sin equipos registrados.</p>';
    return;
  }

  const rows = teams.map((t, i) => {
    const icons = ['🥇','🥈','🥉'];
    return `
      <tr>
        <td><strong style="color:var(--gold);">${icons[i] || '#' + (i+1)}</strong></td>
        <td style="color:var(--text-primary); font-weight:600;">${escHtml(t.name)}</td>
        <td><span style="color:var(--cyan); font-family:var(--font-display); font-size:1.1rem;">${t.score ?? 0}</span></td>
        <td>${t.completedChallenges?.length || 0} / ${totalCh}</td>
        <td>${(t.members || []).join(', ') || '—'}</td>
        <td>
          <div class="inline-btns">
            <button class="mini-btn" onclick="editTeamScore('${t.id}')">📋 Progreso</button>
            <button class="mini-btn danger" onclick="resetTeamProgress('${t.id}')">↺</button>
          </div>
        </td>
      </tr>`;
  }).join('');

  wrap.innerHTML = `
    <table class="admin-table">
      <thead><tr><th>#</th><th>Equipo</th><th>Puntos</th><th>Completados</th><th>Integrantes</th><th>Acciones</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

async function editTeamScore(teamId) {
  const teams = await Store.getTeams();
  const cats  = await Store.getCategories();
  const team  = teams.find(t => t.id === teamId);
  if (!team) return;

  // completed es un Set de challenge IDs
  const completed = new Set(team.completedChallenges || []);

  // Calcular puntaje total de los challenges marcados
  function calcScore(completedSet) {
    let total = 0;
    cats.forEach(cat => {
      (cat.challenges || []).forEach(ch => {
        if (completedSet.has(ch.id)) {
          total += (DIFFICULTY[ch.difficulty]?.points || 1);
        }
      });
    });
    return total;
  }

  // Construir HTML de categorías + challenges
  function buildChallengesHtml(diffFilter) {
    let html = '';
    cats.forEach(cat => {
      const challenges = (cat.challenges || []).filter(ch =>
        !diffFilter || ch.difficulty === diffFilter
      );
      if (!challenges.length) return;

      const rows = challenges.map(ch => {
        const diff   = DIFFICULTY[ch.difficulty] || DIFFICULTY.basic;
        const isDone = completed.has(ch.id);
        return `
          <label class="prog-challenge-row ${isDone ? 'done' : ''}" data-ch-id="${ch.id}">
            <input type="checkbox" class="prog-cb" data-ch-id="${ch.id}" data-pts="${diff.points}"
              ${isDone ? 'checked' : ''} onchange="adminProgToggle(this)" />
            <span class="prog-ch-title">${escHtml(ch.title)}</span>
            <span class="diff-badge" style="color:${diff.color}; border-color:${diff.color}; background:${diff.color}18; font-size:0.65rem; padding:2px 8px;">${diff.icon} ${diff.label}</span>
            <span class="prog-pts" style="color:var(--cyan); font-family:var(--font-display); font-size:0.78rem; white-space:nowrap;">+${diff.points} pts</span>
          </label>`;
      }).join('');

      html += `
        <div class="prog-cat-block" style="margin-bottom:16px;">
          <div class="prog-cat-header">
            <span style="font-size:18px;">${cat.icon || '📁'}</span>
            <span style="font-family:var(--font-display); font-size:0.72rem; color:${cat.color}; letter-spacing:0.08em;">${escHtml(cat.name)}</span>
            <span style="font-size:0.68rem; color:var(--text-muted); margin-left:auto;">
              ${challenges.filter(ch => completed.has(ch.id)).length}/${challenges.length}
            </span>
          </div>
          <div class="prog-challenges-list">${rows}</div>
        </div>`;
    });

    if (!html) html = '<p style="color:var(--text-muted); text-align:center; padding:20px 0; font-size:0.82rem;">Sin desafíos para este filtro.</p>';
    return html;
  }

  function buildModal(diffFilter) {
    const score = calcScore(completed);
    const totalCh = cats.reduce((s, c) => s + (c.challenges?.length || 0), 0);
    const doneCount = completed.size;

    const filterBtns = [
      { val: '',            label: 'Todos' },
      { val: 'basic',       label: '⭐' },
      { val: 'medium',      label: '⭐⭐' },
      { val: 'hard',        label: '⭐⭐⭐' },
      { val: 'ieee-master', label: '👑' }
    ].map(f => `
      <button class="filter-pill ${diffFilter === f.val ? 'active' : ''}"
        onclick="adminProgFilter('${f.val}')">${f.label}</button>
    `).join('');

    return `
      <div class="modal-title">📋 Progreso — ${escHtml(team.name)}</div>

      <!-- Stats strip -->
      <div style="display:flex; gap:10px; margin-bottom:16px;">
        <div style="flex:1; background:var(--bg-deep); border:1px solid var(--border); border-radius:8px; padding:10px; text-align:center;">
          <div id="prog-score-display" style="font-family:var(--font-display); font-size:1.4rem; color:var(--cyan);">${score}</div>
          <div style="font-size:0.62rem; color:var(--text-muted); letter-spacing:0.1em; margin-top:2px;">PUNTOS</div>
        </div>
        <div style="flex:1; background:var(--bg-deep); border:1px solid var(--border); border-radius:8px; padding:10px; text-align:center;">
          <div id="prog-done-display" style="font-family:var(--font-display); font-size:1.4rem; color:var(--green);">${doneCount}</div>
          <div style="font-size:0.62rem; color:var(--text-muted); letter-spacing:0.1em; margin-top:2px;">COMPLETADOS / ${totalCh}</div>
        </div>
      </div>

      <!-- Filtro dificultad -->
      <div style="margin-bottom:14px;">
        <div style="font-family:var(--font-display); font-size:0.58rem; color:var(--text-muted); letter-spacing:0.12em; margin-bottom:8px;">FILTRAR POR DIFICULTAD</div>
        <div class="filter-pills" id="prog-filter-pills">${filterBtns}</div>
      </div>

      <!-- Lista de challenges -->
      <div id="prog-challenges-wrap" style="max-height:400px; overflow-y:auto; padding-right:4px;">
        ${buildChallengesHtml(diffFilter)}
      </div>

      <div style="display:flex; gap:10px; justify-content:flex-end; margin-top:20px;">
        <button class="btn btn-ghost" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveTeamProgress('${teamId}')">💾 Guardar Progreso</button>
      </div>`;
  }

  // Guardar estado del filtro en el modal
  window._adminProgFilter  = '';
  window._adminProgTeamId  = teamId;
  window._adminProgCompleted = completed;
  window._adminProgCats    = cats;
  window._adminProgTeams   = teams;

  showModal(buildModal(''), true);
}

// Llamado cuando cambia el filtro de dificultad dentro del modal de progreso
function adminProgFilter(diff) {
  window._adminProgFilter = diff;
  const wrap = document.getElementById('prog-challenges-wrap');
  const pills = document.getElementById('prog-filter-pills');
  if (!wrap || !pills) return;

  // Actualizar pills activas
  pills.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim() === ({
      '': 'Todos', 'basic': '⭐', 'medium': '⭐⭐', 'hard': '⭐⭐⭐', 'ieee-master': '👑'
    }[diff] || 'Todos'));
  });

  const completed = window._adminProgCompleted;
  const cats      = window._adminProgCats;

  let html = '';
  cats.forEach(cat => {
    const challenges = (cat.challenges || []).filter(ch => !diff || ch.difficulty === diff);
    if (!challenges.length) return;
    const rows = challenges.map(ch => {
      const d = DIFFICULTY[ch.difficulty] || DIFFICULTY.basic;
      const isDone = completed.has(ch.id);
      return `
        <label class="prog-challenge-row ${isDone ? 'done' : ''}" data-ch-id="${ch.id}">
          <input type="checkbox" class="prog-cb" data-ch-id="${ch.id}" data-pts="${d.points}"
            ${isDone ? 'checked' : ''} onchange="adminProgToggle(this)" />
          <span class="prog-ch-title">${escHtml(ch.title)}</span>
          <span class="diff-badge" style="color:${d.color}; border-color:${d.color}; background:${d.color}18; font-size:0.65rem; padding:2px 8px;">${d.icon} ${d.label}</span>
          <span class="prog-pts" style="color:var(--cyan); font-family:var(--font-display); font-size:0.78rem; white-space:nowrap;">+${d.points} pts</span>
        </label>`;
    }).join('');
    html += `
      <div class="prog-cat-block" style="margin-bottom:16px;">
        <div class="prog-cat-header">
          <span style="font-size:18px;">${cat.icon || '📁'}</span>
          <span style="font-family:var(--font-display); font-size:0.72rem; color:${cat.color}; letter-spacing:0.08em;">${escHtml(cat.name)}</span>
          <span style="font-size:0.68rem; color:var(--text-muted); margin-left:auto;">
            ${challenges.filter(ch => completed.has(ch.id)).length}/${challenges.length}
          </span>
        </div>
        <div class="prog-challenges-list">${rows}</div>
      </div>`;
  });
  if (!html) html = '<p style="color:var(--text-muted); text-align:center; padding:20px 0; font-size:0.82rem;">Sin desafíos para este filtro.</p>';
  wrap.innerHTML = html;
}

// Llamado cuando se marca/desmarca un checkbox
function adminProgToggle(cb) {
  const chId = cb.dataset.chId;
  const completed = window._adminProgCompleted;
  const row = cb.closest('.prog-challenge-row');

  if (cb.checked) {
    completed.add(chId);
    row?.classList.add('done');
  } else {
    completed.delete(chId);
    row?.classList.remove('done');
  }

  // Recalcular score en vivo
  const cats = window._adminProgCats;
  let score = 0;
  cats.forEach(cat => {
    (cat.challenges || []).forEach(ch => {
      if (completed.has(ch.id)) score += (DIFFICULTY[ch.difficulty]?.points || 1);
    });
  });

  const scoreEl = document.getElementById('prog-score-display');
  const doneEl  = document.getElementById('prog-done-display');
  if (scoreEl) scoreEl.textContent = score;
  if (doneEl)  doneEl.textContent  = completed.size;

  // Actualizar contador en el header de la categoría correspondiente
  cats.forEach(cat => {
    if (!(cat.challenges || []).find(ch => ch.id === chId)) return;
    const allBlocks = document.querySelectorAll('.prog-cat-block');
    allBlocks.forEach(block => {
      const nameEl = block.querySelector('[style*="font-display"]');
      if (!nameEl || nameEl.textContent.trim() !== cat.name) return;
      const visibleChallenges = block.querySelectorAll('.prog-cb');
      const visibleIds = [...visibleChallenges].map(c => c.dataset.chId);
      const doneCnt = visibleIds.filter(id => completed.has(id)).length;
      const countEl = block.querySelector('.prog-cat-header span:last-child');
      if (countEl) countEl.textContent = `${doneCnt}/${visibleIds.length}`;
    });
  });
}

// Guardar progreso del equipo
async function saveTeamProgress(teamId) {
  const completed = window._adminProgCompleted;
  const cats      = window._adminProgCats;

  let score = 0;
  cats.forEach(cat => {
    (cat.challenges || []).forEach(ch => {
      if (completed.has(ch.id)) score += (DIFFICULTY[ch.difficulty]?.points || 1);
    });
  });

  const teams = await Store.getTeams();
  const team  = teams.find(t => t.id === teamId);
  if (!team) return;

  team.completedChallenges = [...completed];
  team.score = score;

  await Store.saveTeam(team);
  closeModal();
  renderAdminRanking();
  showToast(`✅ Progreso de "${team.name}" actualizado — ${score} pts`, 'success');
}

async function confirmResetScores() {
  if (!confirm('¿Resetear TODOS los puntajes y progreso de TODOS los equipos? Esta acción no se puede deshacer.')) return;
  const teams = await Store.getTeams();
  for (const t of teams) {
    t.score = 0;
    t.completedChallenges = [];
    await Store.saveTeam(t);
  }
  renderAdminRanking();
  showToast('Todos los puntajes reseteados', 'info');
}

// ── Modal ─────────────────────────────────────────────────
function showModal(html, large = false) {
  closeModal();
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'active-modal';
  overlay.innerHTML = `<div class="modal" style="${large ? 'max-width:700px;' : ''}">${html}</div>`;
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  document.body.appendChild(overlay);
}

function closeModal() {
  document.getElementById('active-modal')?.remove();
}

// ── Utilities ──────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type]||''}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateX(20px)'; toast.style.transition='0.3s'; setTimeout(()=>toast.remove(),300); }, 4000);
}

// ── IMPORTAR DESAFÍOS DESDE JSON ──────────────────────────
/*
  Formato esperado del JSON:
  [
    {
      "category": "Algoritmia",                  // requerido
      "categoryIcon": "⚡",                       // opcional
      "categoryColor": "#F0A500",                // opcional
      "title": "Suma de Arrays",                 // requerido
      "difficulty": "basic|medium|hard|ieee-master", // requerido
      "description": "...",                      // requerido
      "inputFormat": "...",                      // opcional
      "outputFormat": "...",                     // opcional
      "examples": [                              // opcional
        { "input": "1 2 3", "output": "6" }
      ],
      "hiddenTests": [                           // opcional
        { "input": "4 5 6", "output": "15" }
      ]
    },
    ...
  ]
*/

const VALID_DIFFICULTIES = ['basic', 'medium', 'hard', 'ieee-master'];

async function importChallengesJSON(input) {
  const file = input.files[0];
  input.value = ''; // reset para permitir reimportar el mismo archivo
  if (!file) return;

  // ── Leer archivo ──────────────────────────────────────────
  let raw;
  try {
    raw = await file.text();
  } catch (e) {
    showToast('❌ No se pudo leer el archivo', 'error');
    return;
  }

  // ── Parsear JSON ──────────────────────────────────────────
  let items;
  try {
    items = JSON.parse(raw);
  } catch (e) {
    showToast('❌ JSON inválido: ' + e.message, 'error');
    return;
  }

  if (!Array.isArray(items)) {
    showToast('❌ El JSON debe ser un array de desafíos [ {...}, {...} ]', 'error');
    return;
  }

  if (items.length === 0) {
    showToast('⚠ El JSON está vacío', 'info');
    return;
  }

  // ── Cargar categorías existentes ──────────────────────────
  let categories = await Store.getCategories();

  // ── Procesar cada item ────────────────────────────────────
  const errors   = [];   // { index, title, reason }
  const imported = [];   // títulos importados correctamente

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const label = `#${i + 1}${item.title ? ' "' + item.title + '"' : ''}`;

    // Validaciones del desafío
    if (!item.title || typeof item.title !== 'string' || !item.title.trim()) {
      errors.push({ label, reason: 'Falta el campo "title"' });
      continue;
    }
    if (!item.description || typeof item.description !== 'string' || !item.description.trim()) {
      errors.push({ label, reason: 'Falta el campo "description"' });
      continue;
    }
    if (!item.category || typeof item.category !== 'string' || !item.category.trim()) {
      errors.push({ label, reason: 'Falta el campo "category"' });
      continue;
    }
    if (!item.difficulty) {
      errors.push({ label, reason: 'Falta el campo "difficulty"' });
      continue;
    }
    if (!VALID_DIFFICULTIES.includes(item.difficulty)) {
      errors.push({ label, reason: `Dificultad inválida: "${item.difficulty}". Valores válidos: ${VALID_DIFFICULTIES.join(', ')}` });
      continue;
    }

    // Buscar o crear categoría
    const catName = item.category.trim();
    let cat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase());

    if (!cat) {
      // Crear nueva categoría
      cat = {
        id:         genId(),
        name:       catName,
        icon:       item.categoryIcon  || '📁',
        color:      item.categoryColor || '#F0A500',
        challenges: []
      };
      try {
        await Store.saveCategory(cat);
        categories.push(cat);
      } catch (e) {
        errors.push({ label, reason: `No se pudo crear la categoría "${catName}": ${e.message}` });
        continue;
      }
    }

    // Construir desafío
    const examples = Array.isArray(item.examples)
      ? item.examples.filter(e => e && e.input !== undefined)
      : [];

    const hiddenTests = Array.isArray(item.hiddenTests)
      ? item.hiddenTests.filter(t => t && t.input !== undefined)
      : [];

    const challenge = {
      id:           genId(),
      title:        item.title.trim(),
      difficulty:   item.difficulty,
      description:  item.description.trim(),
      inputFormat:  (item.inputFormat  || '').trim(),
      outputFormat: (item.outputFormat || '').trim(),
      examples,
      hiddenTests
    };

    try {
      await Store.saveChallenge(cat.id, challenge);
      imported.push(challenge.title);
    } catch (e) {
      errors.push({ label, reason: `Error al guardar: ${e.message}` });
    }
  }

  // ── Mostrar resultado en modal ────────────────────────────
  renderChallengesTable();
  populateCatFilter();
  showImportReport(items.length, imported, errors);
}

function showImportReport(total, imported, errors) {
  const hasErrors   = errors.length > 0;
  const hasImported = imported.length > 0;

  const successHtml = hasImported ? `
    <div style="margin-bottom:16px;">
      <div style="color:var(--green); font-family:var(--font-display); font-size:0.75rem; letter-spacing:0.1em; margin-bottom:10px;">
        ✅ IMPORTADOS (${imported.length})
      </div>
      <ul style="list-style:none; display:flex; flex-direction:column; gap:4px;">
        ${imported.map(t => `
          <li style="font-size:0.82rem; color:var(--text-secondary); padding:6px 10px; background:rgba(61,214,140,0.07); border-left:2px solid var(--green); border-radius:4px;">
            ${escHtml(t)}
          </li>`).join('')}
      </ul>
    </div>` : '';

  const errorHtml = hasErrors ? `
    <div>
      <div style="color:var(--red); font-family:var(--font-display); font-size:0.75rem; letter-spacing:0.1em; margin-bottom:10px;">
        ❌ NO IMPORTADOS (${errors.length})
      </div>
      <ul style="list-style:none; display:flex; flex-direction:column; gap:6px;">
        ${errors.map(e => `
          <li style="font-size:0.82rem; padding:8px 10px; background:rgba(255,64,96,0.07); border-left:2px solid var(--red); border-radius:4px;">
            <span style="color:var(--text-primary); font-weight:600;">${escHtml(e.label)}</span>
            <span style="color:var(--text-muted); display:block; font-size:0.75rem; margin-top:2px;">→ ${escHtml(e.reason)}</span>
          </li>`).join('')}
      </ul>
    </div>` : '';

  const summary = `
    <div style="display:flex; gap:16px; margin-bottom:20px; flex-wrap:wrap;">
      <div style="flex:1; min-width:100px; background:var(--bg-deep); border-radius:8px; padding:14px; text-align:center; border:1px solid var(--border);">
        <div style="font-family:var(--font-display); font-size:1.4rem; color:var(--text-primary);">${total}</div>
        <div style="font-size:0.65rem; color:var(--text-muted); letter-spacing:0.1em; margin-top:4px;">TOTAL</div>
      </div>
      <div style="flex:1; min-width:100px; background:rgba(61,214,140,0.07); border-radius:8px; padding:14px; text-align:center; border:1px solid rgba(61,214,140,0.2);">
        <div style="font-family:var(--font-display); font-size:1.4rem; color:var(--green);">${imported.length}</div>
        <div style="font-size:0.65rem; color:var(--text-muted); letter-spacing:0.1em; margin-top:4px;">IMPORTADOS</div>
      </div>
      <div style="flex:1; min-width:100px; background:rgba(255,64,96,0.07); border-radius:8px; padding:14px; text-align:center; border:1px solid rgba(255,64,96,0.2);">
        <div style="font-family:var(--font-display); font-size:1.4rem; color:${errors.length ? 'var(--red)' : 'var(--text-muted)'};">${errors.length}</div>
        <div style="font-size:0.65rem; color:var(--text-muted); letter-spacing:0.1em; margin-top:4px;">ERRORES</div>
      </div>
    </div>`;

  showModal(`
    <div class="modal-title">📥 Reporte de Importación</div>
    ${summary}
    <div style="max-height:360px; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
      ${successHtml}
      ${errorHtml}
    </div>
    <div style="margin-top:20px; text-align:right;">
      <button class="btn btn-primary" onclick="closeModal()">Cerrar</button>
    </div>`, true);
}

// ── BULK DELETE ───────────────────────────────────────────

// Genera el HTML de la barra de acción (inicialmente oculta)
function bulkBarHtml(wrapId, entityType) {
  const labels = {
    admins:     'administrador',
    teams:      'equipo',
    categories: 'categoría',
    challenges: 'desafío'
  };
  return `
    <div class="bulk-bar" id="bulk-bar-${wrapId}" style="display:none;">
      <span class="bulk-count" id="bulk-count-${wrapId}">0 seleccionados</span>
      <div style="flex:1;"></div>
      <button class="btn btn-ghost" style="font-size:0.78rem; padding:6px 14px;"
              onclick="toggleAllCheckboxes('${wrapId}', false); updateBulkBar('${wrapId}')">
        Deseleccionar todo
      </button>
      <button class="btn btn-danger" style="font-size:0.78rem; padding:6px 14px;"
              onclick="bulkDelete('${wrapId}', '${entityType}', '${labels[entityType]}')">
        🗑 Eliminar seleccionados
      </button>
    </div>`;
}

// Muestra u oculta la barra según cuántos checkboxes están marcados
function updateBulkBar(wrapId) {
  const wrap  = document.getElementById(wrapId);
  const bar   = document.getElementById(`bulk-bar-${wrapId}`);
  const count = document.getElementById(`bulk-count-${wrapId}`);
  if (!wrap || !bar) return;

  const checked = wrap.querySelectorAll('.bulk-cb:checked').length;
  const total   = wrap.querySelectorAll('.bulk-cb').length;

  bar.style.display = checked > 0 ? 'flex' : 'none';
  count.textContent = `${checked} de ${total} seleccionado${checked !== 1 ? 's' : ''}`;

  // Sincronizar "seleccionar todo"
  const cbAll = wrap.querySelector('.bulk-cb-all');
  if (cbAll) {
    cbAll.checked       = checked === total && total > 0;
    cbAll.indeterminate = checked > 0 && checked < total;
  }
}

// Marca o desmarca todos los checkboxes de una tabla
function toggleAllCheckboxes(wrapId, checked) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;
  wrap.querySelectorAll('.bulk-cb').forEach(cb => cb.checked = checked);
  updateBulkBar(wrapId);
}

// Orquestador del borrado masivo
async function bulkDelete(wrapId, entityType, label) {
  const wrap = document.getElementById(wrapId);
  if (!wrap) return;

  const ids = [...wrap.querySelectorAll('.bulk-cb:checked')].map(cb => cb.dataset.id);
  if (!ids.length) return;

  const plural = ids.length === 1 ? `este ${label}` : `estos ${ids.length} ${label}s`;
  const extra  = entityType === 'categories'
    ? ' (se eliminarán también todos sus desafíos)'
    : '';

  showConfirmAdmin(
    `¿Eliminar ${plural}?`,
    `Esta acción es irreversible${extra}.`,
    async () => {
      try {
        if (entityType === 'admins')     await bulkDeleteAdmins(ids);
        if (entityType === 'teams')      await bulkDeleteTeams(ids);
        if (entityType === 'categories') await bulkDeleteCategories(ids);
        if (entityType === 'challenges') await bulkDeleteChallenges(ids);
        showToast(`✅ ${ids.length} ${label}${ids.length !== 1 ? 's' : ''} eliminado${ids.length !== 1 ? 's' : ''}`, 'success');
      } catch (e) {
        showToast('❌ Error al eliminar: ' + e.message, 'error');
      }
    }
  );
}

async function bulkDeleteAdmins(ids) {
  for (const id of ids) {
    const res = await authFetch(`/api/admins/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `No se pudo eliminar admin ${id}`);
    }
  }
  renderAdminsTable();
}

async function bulkDeleteTeams(ids) {
  for (const id of ids) await Store.deleteTeam(id);
  renderTeamsTable();
}

async function bulkDeleteCategories(ids) {
  for (const id of ids) await Store.deleteCategory(id);
  renderCatsTable();
  renderChallengesTable();
  populateCatFilter();
}

async function bulkDeleteChallenges(ids) {
  // ids tienen formato "catId::challengeId"
  for (const composite of ids) {
    const [catId, chId] = composite.split('::');
    await Store.deleteChallenge(catId, chId);
  }
  renderChallengesTable();
}

// Modal de confirmación sin usar window.confirm (mantiene el estilo del panel)
function showConfirmAdmin(title, msg, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title" style="color:var(--red);">⚠ ${title}</div>
      <p style="color:var(--text-secondary); margin-bottom:20px; font-size:0.88rem;">${msg}</p>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-danger" id="bulk-confirm-ok">Eliminar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#bulk-confirm-ok').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
}
