let currentTeam = null;
let monacoEditor = null;
let currentChallenge = null;
let currentCatId = null;
let timerInterval = null;
let currentDifficultyFilter = null;

// ── Init ──────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', async () => {
  await applyConfig();

  // Try auto-login from session
  const team = await getCurrentTeam();
  if (team) {
    currentTeam = team;
    enterApp();
  }

  // Monaco
  require.config({ paths: { vs: 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.44.0/min/vs' } });
  require(['vs/editor/editor.main'], () => {
    monaco.editor.defineTheme('hackathon', {
      base: 'vs-dark',
      inherit: true,
      rules: [
        { token: 'comment',  foreground: '3d5a7a', fontStyle: 'italic' },
        { token: 'keyword',  foreground: '00f5ff' },
        { token: 'string',   foreground: '00ff87' },
        { token: 'number',   foreground: 'ffd700' },
      ],
      colors: {
        'editor.background':                '#0a1220',
        'editor.foreground':                '#e8f4ff',
        'editor.lineHighlightBackground':   '#0d1830',
        'editorLineNumber.foreground':      '#3d5a7a',
        'editorLineNumber.activeForeground':'#00f5ff',
        'editor.selectionBackground':       '#00f5ff22',
        'editorCursor.foreground':          '#00f5ff',
      }
    });
  });

  // sidebar-nav: el cierre del menu se maneja dentro de openChallenge()
  // para no cerrar al expandir/colapsar categorias
  document.querySelector('.sidebar-bottom')?.addEventListener('click', () => {
    if (window.innerWidth <= 768) closeMobileMenu();
  });
});

// ── Mobile Menu ───────────────────────────────────────────
function toggleMobileMenu() {
  const sidebar  = document.getElementById('sidebar');
  const btn      = document.getElementById('mobile-menu-btn');
  const overlay  = document.getElementById('sidebar-overlay');
  const open = sidebar.classList.toggle('mobile-open');
  btn.classList.toggle('open', open);
  overlay.classList.toggle('active', open);
  document.body.style.overflow = open ? 'hidden' : '';
}

function closeMobileMenu() {
  const sidebar = document.getElementById('sidebar');
  const btn     = document.getElementById('mobile-menu-btn');
  const overlay = document.getElementById('sidebar-overlay');
  sidebar.classList.remove('mobile-open');
  btn.classList.remove('open');
  overlay.classList.remove('active');
  document.body.style.overflow = '';
}

async function applyConfig() {
  const cfg = await Store.getConfig();
  document.title = cfg.title || 'IEEE Hackathon';
  document.getElementById('login-platform-name').textContent = cfg.title || 'Competition Platform';
  document.getElementById('sb-logo-text').textContent = (cfg.title || 'HACKATHON').toUpperCase();
  if (cfg.logo) {
    document.getElementById('sb-logo-img').innerHTML = `<img src="${cfg.logo}" style="width:45px;height:45px;object-fit:contain;">`;
    document.getElementById('login-logo-emoji').parentElement.innerHTML = `<img src="${cfg.logo}" style="width:120px;height:120px;object-fit:contain;">`;
  }
}

// ── Login ─────────────────────────────────────────────────
async function doLogin() {
  const name     = document.getElementById('login-team-user').value.trim();
  const password = document.getElementById('login-team-password').value.trim();
  if (!name)     { showToast('Ingresa el nombre de tu equipo', 'error'); return; }
  if (!password) { showToast('Ingresa la contraseña de tu equipo', 'error'); return; }

  try {
    const res = await fetch('/api/auth/team-login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ teamName: name, password })
    });

    if (res.ok) {
      const data = await res.json();
      currentTeam = data.team;
      setCurrentTeam(currentTeam);
      enterApp();
      showToast('✅ Bienvenido, ' + currentTeam.name, 'success');
    } else {
      showToast('❌ Equipo o contraseña incorrectos', 'error');
    }
  } catch (e) {
    showToast('Error de conexión: ' + e.message, 'error');
  }
}

function enterApp() {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'block';

  // Sidebar y boton hamburguesa viven fuera del #app
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('mobile-menu-btn');
  if (sidebar) sidebar.style.display = 'flex';
  if (menuBtn) menuBtn.style.display = window.innerWidth <= 768 ? 'flex' : 'none';

  renderSidebar();
  updateSidebarTeamInfo();
  showPage('dashboard');
  startTimer();
  checkCompetitionStatus();
}

function doLogout() {
  currentTeam = null;
  setCurrentTeam(null);
  closeMobileMenu();
  document.getElementById('login-screen').style.display = 'flex';
  document.getElementById('app').style.display = 'none';
  // Ocultar sidebar y boton al cerrar sesion
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('mobile-menu-btn');
  if (sidebar) sidebar.style.display = 'none';
  if (menuBtn) menuBtn.style.display = 'none';
  document.getElementById('login-team-user').value = '';
  document.getElementById('login-team-password').value = '';
  if (timerInterval) clearInterval(timerInterval);
}

// ── Sidebar ───────────────────────────────────────────────
async function renderSidebar() {
  const nav        = document.getElementById('sidebar-nav');
  const categories = await Store.getCategories();
  nav.innerHTML    = '';

  categories.forEach(cat => {
    const allChallenges  = cat.challenges || [];
    const completedIds   = currentTeam?.completedChallenges || [];

    // Apply difficulty filter — only filter the challenge list, keep category visible
    const challenges = currentDifficultyFilter
      ? allChallenges.filter(ch => ch.difficulty === currentDifficultyFilter)
      : allChallenges;

    // Hide category if filter is active and no challenges match
    if (currentDifficultyFilter && challenges.length === 0) return;

    const div = document.createElement('div');
    div.className = 'nav-category';
    div.id = `nav-cat-${cat.id}`;

    const challengeItems = challenges.map(ch => {
      const isCompleted = completedIds.includes(ch.id);
      const diff        = DIFFICULTY[ch.difficulty] || DIFFICULTY.basic;
      return `
        <div class="nav-challenge-item ${isCompleted ? 'completed' : ''}"
             id="nav-ch-${ch.id}"
             onclick="openChallenge('${cat.id}','${ch.id}')">
          <span class="nav-diff-dot" style="background:${diff.color}"></span>
          <span class="nav-challenge-title">${ch.title}</span>
        </div>`;
    }).join('');

    div.innerHTML = `
      <div class="nav-category-header" onclick="toggleNavCat('${cat.id}')">
        <span class="nav-category-icon">${cat.icon || '📁'}</span>
        <span class="nav-category-name sidebar-text">${cat.name}</span>
        <span class="nav-category-arrow sidebar-text">›</span>
      </div>
      <div class="nav-challenges">${challengeItems}</div>`;

    nav.appendChild(div);
  });
}

function setDifficultyFilter(diff) {
  currentDifficultyFilter = diff || null;

  // Update pill active state
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.toggle('active', (btn.dataset.diff || null) === currentDifficultyFilter);
  });

  renderSidebar();
}

function toggleNavCat(catId) {
  const el = document.getElementById(`nav-cat-${catId}`);
  if (el) el.classList.toggle('open');
}

async function updateSidebarTeamInfo() {
  if (!currentTeam) return;
  const teams = await Store.getTeams();
  const team  = teams.find(t => t.id === currentTeam.id);
  if (team) currentTeam = team;

  document.getElementById('sb-team-info').style.display = 'block';
  document.getElementById('sb-team-name').textContent  = currentTeam.name.toUpperCase();
  document.getElementById('sb-team-score').textContent = currentTeam.score ?? 0;

  const cats    = await Store.getCategories();
  const totalCh = cats.reduce((s, c) => s + (c.challenges?.length || 0), 0);
  const done    = currentTeam.completedChallenges?.length || 0;
  const pct     = totalCh > 0 ? Math.round(done / totalCh * 100) : 0;
  document.getElementById('sb-progress').style.width = pct + '%';
}

// ── Pages ─────────────────────────────────────────────────
function showPage(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById(`page-${name}`)?.classList.add('active');

  if (name === 'dashboard') renderDashboard();
  if (name === 'ranking')   renderRanking();

  document.querySelectorAll('.nav-challenge-item').forEach(el => el.classList.remove('active'));
}

function showRankingFromEnded() {
  document.getElementById('ended-overlay').classList.remove('active');
  renderRanking();
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-ranking').classList.add('active');
}

// ── Dashboard ─────────────────────────────────────────────
async function renderDashboard() {
  const cats         = await Store.getCategories();
  const team         = currentTeam;
  const completedIds = team?.completedChallenges || [];

  const totalCh       = cats.reduce((s, c) => s + (c.challenges?.length || 0), 0);
  const totalPossible = cats.reduce((s, c) => s + (c.challenges || []).reduce((sp, ch) => sp + (DIFFICULTY[ch.difficulty]?.points || 1), 0), 0);

  document.getElementById('dash-stats').innerHTML = `
    <div class="stat-card" style="--accent:var(--cyan)">
      <div class="stat-label">Puntaje</div>
      <div class="stat-value" style="color:var(--cyan)">${team?.score ?? 0}</div>
      <div class="stat-sub">de ${totalPossible} posibles</div>
    </div>
    <div class="stat-card" style="--accent:var(--green)">
      <div class="stat-label">Resueltos</div>
      <div class="stat-value" style="color:var(--green)">${completedIds.length}</div>
      <div class="stat-sub">de ${totalCh} desafíos</div>
    </div>
    <div class="stat-card" style="--accent:var(--purple)">
      <div class="stat-label">Pendientes</div>
      <div class="stat-value" style="color:var(--purple)">${totalCh - completedIds.length}</div>
      <div class="stat-sub">desafíos por completar</div>
    </div>`;

  document.getElementById('dash-categories').innerHTML = cats.map(cat => {
    const chs  = cat.challenges || [];
    const done = chs.filter(ch => completedIds.includes(ch.id)).length;
    const pct  = chs.length > 0 ? Math.round(done / chs.length * 100) : 0;
    return `
      <div class="card" style="cursor:pointer; border-color:${cat.color}22;" onclick="openFirstChallenge('${cat.id}')">
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:12px;">
          <span style="font-size:24px;">${cat.icon}</span>
          <div>
            <div style="font-family:var(--font-display); font-size:0.75rem; color:${cat.color}; letter-spacing:0.08em;">${cat.name}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${chs.length} desafíos</div>
          </div>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%; background:${cat.color};"></div></div>
        <div style="font-size:0.7rem; color:var(--text-muted); margin-top:5px;">${done}/${chs.length} completados</div>
      </div>`;
  }).join('');
}

async function openFirstChallenge(catId) {
  const cats = await Store.getCategories();
  const cat  = cats.find(c => c.id === catId);
  if (cat?.challenges?.length) openChallenge(catId, cat.challenges[0].id);
}

// ── Challenge View ─────────────────────────────────────────
async function openChallenge(catId, challengeId) {
  // Cerrar sidebar en movil al seleccionar un desafio
  if (window.innerWidth <= 768) closeMobileMenu();
  if (!(await isCompActive())) {
    showToast('La competencia ha terminado', 'error');
    return;
  }

  const cats = await Store.getCategories();
  const cat  = cats.find(c => c.id === catId);
  if (!cat) return;
  const ch = cat.challenges.find(c => c.id === challengeId);
  if (!ch) return;

  currentChallenge = ch;
  currentCatId     = catId;

  document.querySelectorAll('.nav-challenge-item').forEach(el => el.classList.remove('active'));
  document.getElementById(`nav-ch-${ch.id}`)?.classList.add('active');

  const navCat = document.getElementById(`nav-cat-${catId}`);
  if (navCat && !navCat.classList.contains('open')) navCat.classList.add('open');

  showPage('challenge');
  renderChallenge(ch);
}

function renderChallenge(ch) {
  const diff         = DIFFICULTY[ch.difficulty] || DIFFICULTY.basic;
  const completedIds = currentTeam?.completedChallenges || [];
  const isCompleted  = completedIds.includes(ch.id);

  const examplesHtml = (ch.examples || []).slice(0, 2).map((ex, i) => `
    <div class="io-example">
      <div class="io-example-label">Ejemplo ${i + 1} — Input</div>
      <code>${escHtml(ex.input)}</code>
      <div class="io-example-label" style="margin-top:8px;">Output</div>
      <code style="color:var(--cyan)">${escHtml(ex.output)}</code>
    </div>`).join('');

  const statusBanner = isCompleted
    ? `<div style="background:rgba(0,255,135,0.1); border:1px solid var(--green); border-radius:8px; padding:12px 16px; margin-bottom:16px; color:var(--green); font-size:0.85rem; display:flex; align-items:center; gap:10px;">✅ Ya resolviste este desafío correctamente</div>`
    : '';

  document.getElementById('challenge-content').innerHTML = `
    ${statusBanner}
    <div class="challenge-header">
      <h2 class="challenge-title">${ch.title}</h2>
      <span class="diff-badge" style="color:${diff.color}; border-color:${diff.color}; background:${diff.color}18;">
        ${diff.icon} ${diff.label} · ${diff.points} pt${diff.points !== 1 ? 's' : ''}
      </span>
    </div>

    <div class="challenge-layout">
      <div class="card">
        <div class="challenge-section-title">Descripción</div>
        <p class="challenge-desc">${escHtml(ch.description)}</p>
        <div class="challenge-section-title">Formato de Entrada</div>
        <p class="challenge-desc" style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-muted);">${escHtml(ch.inputFormat || '')}</p>
        <div class="challenge-section-title">Formato de Salida</div>
        <p class="challenge-desc" style="font-family:var(--font-mono); font-size:0.78rem; color:var(--text-muted);">${escHtml(ch.outputFormat || '')}</p>
        <div class="challenge-section-title">Ejemplos</div>
        ${examplesHtml}
      </div>

      <div class="editor-area">
        <div class="card" style="padding:16px;">
          <div class="editor-toolbar" style="margin-bottom:12px;">
            <select class="lang-select" id="lang-select" onchange="changeLang(this.value)">
              ${Object.entries(LANGUAGES).map(([k, v]) => `<option value="${k}">${v.name}</option>`).join('')}
            </select>
            <button class="btn btn-ghost" onclick="clearEditor()" style="padding:7px 12px; font-size:0.75rem;">🗑 Limpiar</button>
          </div>
          <div class="editor-container" id="editor-container">
            <textarea class="code-textarea" id="fallback-editor" spellcheck="false" placeholder="// Escribe tu código aquí..."></textarea>
          </div>
        </div>

        <div style="display:flex; gap:10px; flex-wrap:wrap;">
          ${!isCompleted ? `
          <button class="btn btn-success" onclick="submitCode()" id="submit-btn">
            <span>▶</span> Enviar Solución
          </button>` : ''}
          <button class="btn btn-ghost" onclick="testOnly()" id="test-btn">
            <span>🧪</span> Solo Probar
          </button>
        </div>

        <div id="test-output"></div>
      </div>
    </div>`;

  initMonacoEditor();
}

// ── Monaco Editor ──────────────────────────────────────────
function initMonacoEditor() {
  if (typeof monaco === 'undefined') return;
  const container = document.getElementById('editor-container');
  container.innerHTML = '';
  const lang      = document.getElementById('lang-select')?.value || 'python';
  const monacoLang = LANGUAGES[lang]?.monacoId || 'python';
  monacoEditor = monaco.editor.create(container, {
    value: getTemplate(lang),
    language: monacoLang,
    theme: 'hackathon',
    fontSize: 13,
    fontFamily: "'JetBrains Mono', monospace",
    minimap: { enabled: false },
    scrollBeyondLastLine: false,
    lineNumbers: 'on',
    renderLineHighlight: 'line',
    automaticLayout: true,
    tabSize: 4,
    wordWrap: 'on',
    padding: { top: 12, bottom: 12 },
    smoothScrolling: true,
    cursorBlinking: 'phase',
    cursorSmoothCaretAnimation: 'on',
  });
}

function changeLang(lang) {
  if (monacoEditor && typeof monaco !== 'undefined') {
    const monacoLang = LANGUAGES[lang]?.monacoId || 'plaintext';
    monaco.editor.setModelLanguage(monacoEditor.getModel(), monacoLang);
    monacoEditor.setValue(getTemplate(lang));
  } else {
    const fallback = document.getElementById('fallback-editor');
    if (fallback) fallback.value = getTemplate(lang);
  }
}

function getCode() {
  if (monacoEditor) return monacoEditor.getValue();
  return document.getElementById('fallback-editor')?.value || '';
}

function clearEditor() {
  if (monacoEditor) monacoEditor.setValue('');
  else if (document.getElementById('fallback-editor')) document.getElementById('fallback-editor').value = '';
}

function loadTemplate() {
  const lang = document.getElementById('lang-select')?.value || 'python';
  const tpl  = getTemplate(lang);
  if (monacoEditor) monacoEditor.setValue(tpl);
  else if (document.getElementById('fallback-editor')) document.getElementById('fallback-editor').value = tpl;
}

function getTemplate(lang) {
  const templates = {
    python:     `import sys\ninput = sys.stdin.readline\n\ndef solve():\n    # Tu solución aquí\n    pass\n\nsolve()\n`,
    javascript: `const lines = require('fs').readFileSync('/dev/stdin','utf8').split('\\n');\nlet idx = 0;\n\nfunction solve() {\n    // Tu solución aquí\n}\n\nsolve();\n`,
    java:       `import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        Scanner sc = new Scanner(System.in);\n        // Tu solución aquí\n    }\n}\n`,
    c:          `#include <stdio.h>\n#include <stdlib.h>\n\nint main() {\n    // Tu solución aquí\n    return 0;\n}\n`,
    cpp:        `#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    ios_base::sync_with_stdio(false);\n    cin.tie(NULL);\n    // Tu solución aquí\n    return 0;\n}\n`,
    go:         `package main\n\nimport (\n    "bufio"\n    "fmt"\n    "os"\n)\n\nfunc main() {\n    reader := bufio.NewReader(os.Stdin)\n    _ = reader\n    // Tu solución aquí\n}\n`,
    rust:       `use std::io::{self, BufRead};\n\nfn main() {\n    let stdin = io::stdin();\n    let mut lines = stdin.lock().lines();\n    // Tu solución aquí\n}\n`,
    ruby:       `# Tu solución aquí\n`,
    csharp:     `using System;\nusing System.Collections.Generic;\n\nclass Program {\n    static void Main(string[] args) {\n        // Tu solución aquí\n    }\n}\n`,
    kotlin:     `import java.util.Scanner\n\nfun main() {\n    val sc = Scanner(System.in)\n    // Tu solución aquí\n}\n`
  };
  return templates[lang] || '// Tu solución aquí\n';
}

// ── Code Execution ─────────────────────────────────────────
async function testOnly() {
  const code = getCode().trim();
  const lang = document.getElementById('lang-select')?.value || 'python';
  if (!code) { showToast('Escribe tu código primero', 'error'); return; }
  setRunningState(true);
  try {
    const suite = await runTestSuite(lang, code, currentChallenge);
    renderTestResults(suite, false);
  } catch (e) {
    showTestError(e.message);
  }
  setRunningState(false);
}

async function submitCode() {
  const code = getCode().trim();
  const lang = document.getElementById('lang-select')?.value || 'python';
  if (!code) { showToast('Escribe tu código primero', 'error'); return; }
  if (!(await isCompActive())) { showToast('La competencia ha terminado', 'error'); return; }

  const completedIds = currentTeam?.completedChallenges || [];
  if (completedIds.includes(currentChallenge.id)) {
    showToast('Ya resolviste este desafío', 'info'); return;
  }

  setRunningState(true);
  try {
    const suite = await runTestSuite(lang, code, currentChallenge);
    renderTestResults(suite, true);
    if (suite.allPassed) await awardPoints(currentChallenge);
    else showToast(`❌ Solución incorrecta — ${suite.passed}/${suite.total} casos pasados.`, 'error');
  } catch (e) {
    showTestError(e.message);
  }
  setRunningState(false);
}

async function awardPoints(ch) {
  const diff  = DIFFICULTY[ch.difficulty] || DIFFICULTY.basic;
  const teams = await Store.getTeams();
  const team  = teams.find(t => t.id === currentTeam.id);
  if (!team) return;

  team.completedChallenges = team.completedChallenges || [];
  if (team.completedChallenges.includes(ch.id)) return;

  team.completedChallenges.push(ch.id);
  team.score = (team.score || 0) + diff.points;
  await Store.saveTeam(team);

  currentTeam = team;
  setCurrentTeam(currentTeam);

  showToast(`🎉 ¡Correcto! +${diff.points} punto${diff.points !== 1 ? 's' : ''} — Total: ${currentTeam.score}`, 'success');
  renderSidebar();
  updateSidebarTeamInfo();
  renderChallenge(ch);
}

/* async function skipChallenge() {
  if (!currentChallenge) return;
  if (!(await isCompActive())) { showToast('La competencia ha terminado', 'error'); return; }

  const completedIds = currentTeam?.completedChallenges || [];
  const skippedIds   = currentTeam?.skippedChallenges   || [];

  if (completedIds.includes(currentChallenge.id)) { showToast('Ya completaste este desafío', 'info'); return; }
  if (skippedIds.includes(currentChallenge.id))   { showToast('Ya saltaste este desafío', 'info'); return; }

  showConfirm(
    '¿Saltar desafío?',
    'Saltar aplica una penalización de -1 punto a tu equipo. ¿Confirmas?',
    async () => {
      const teams = await Store.getTeams();
      const team  = teams.find(t => t.id === currentTeam.id);
      if (!team) return;

      team.skippedChallenges = team.skippedChallenges || [];
      team.skippedChallenges.push(currentChallenge.id);
      team.score = (team.score || 0) - 1;
      await Store.saveTeam(team);

      currentTeam = team;
      setCurrentTeam(currentTeam);

      showToast(`↷ Desafío saltado. -1 punto. Total: ${currentTeam.score}`, 'info');
      renderSidebar();
      updateSidebarTeamInfo();
      renderChallenge(currentChallenge);
    }
  );
} */

// ── Test Results Renderer ──────────────────────────────────
function renderTestResults(suite, isSubmission) {
  const el          = document.getElementById('test-output');
  const passColor   = suite.allPassed ? 'var(--green)' : 'var(--red)';
  const passIcon    = suite.allPassed ? '✅' : '❌';
  const summaryText = suite.allPassed
    ? `Todos los casos pasados (${suite.total}/${suite.total})`
    : `${suite.passed}/${suite.total} casos correctos`;

  let rows = '';
  suite.results.forEach(r => {
    if (r.visible) {
      rows += `
        <div class="test-result-item ${r.passed ? 'pass' : 'fail'}">
          <span class="test-badge ${r.passed ? 'pass' : 'fail'}">${r.passed ? 'PASS' : 'FAIL'}</span>
          <span style="color:var(--text-muted); font-size:0.7rem;">Ejemplo ${r.index}</span>
          <div style="flex:1;">
            <div style="color:var(--text-secondary);">Input: <code style="color:var(--text-primary);">${escHtml(r.input.replace(/\n/g,' ↵ '))}</code></div>
            <div>Esperado: <code style="color:var(--green);">${escHtml(r.expected)}</code> |
            Obtenido: <code style="color:${r.passed ? 'var(--green)' : 'var(--red)'};">${escHtml(r.actual || '(vacío)')}</code></div>
            ${r.stderr ? `<div style="color:var(--red); font-size:0.7rem; margin-top:4px;">Error: ${escHtml(r.stderr.slice(0,200))}</div>` : ''}
          </div>
        </div>`;
    } else {
      rows += `
        <div class="test-result-item ${r.passed ? 'pass' : 'fail'}">
          <span class="test-badge ${r.passed ? 'pass' : 'fail'}">${r.passed ? 'PASS' : 'FAIL'}</span>
          <span style="color:var(--text-muted); font-size:0.7rem;">Test oculto ${r.index}</span>
          <span style="color:var(--text-muted); font-size:0.7rem; flex:1;">[Datos de prueba privados]</span>
        </div>`;
    }
  });

  el.innerHTML = `
    <div class="test-results">
      <div class="test-results-header">
        <span style="font-size:16px;">${passIcon}</span>
        <span style="color:${passColor}; font-weight:600;">${summaryText}</span>
        ${!suite.allPassed && isSubmission ? '<span style="color:var(--orange); font-size:0.75rem; margin-left:auto;">⚠ Revisa tu algoritmo e intenta de nuevo (sin penalización)</span>' : ''}
      </div>
      ${rows}
    </div>`;
}

function showTestError(msg) {
  document.getElementById('test-output').innerHTML = `
    <div class="test-results">
      <div class="test-result-item fail" style="flex-direction:column; align-items:flex-start;">
        <span class="test-badge fail">ERROR</span>
        <span style="color:var(--red); font-size:0.8rem; margin-top:6px;">${escHtml(msg)}</span>
        <span style="color:var(--text-muted); font-size:0.72rem; margin-top:4px;">Verifica que tu código sea correcto y vuelve a intentarlo.</span>
      </div>
    </div>`;
}

function setRunningState(running) {
  const btn     = document.getElementById('submit-btn');
  const testBtn = document.getElementById('test-btn');
  if (btn)     btn.disabled     = running;
  if (testBtn) testBtn.disabled = running;
  if (running) {
    document.getElementById('test-output').innerHTML = `
      <div class="submission-running">
        <div class="spinner"></div>
        <span>Ejecutando código y verificando casos de prueba...</span>
      </div>`;
  }
}

// ── Ranking ────────────────────────────────────────────────
async function renderRanking() {
  const teams = (await Store.getTeams()).sort((a, b) => (b.score || 0) - (a.score || 0));

  if (!teams.length) {
    document.getElementById('ranking-content').innerHTML =
      '<p style="color:var(--text-muted); text-align:center; padding:32px;">No hay equipos registrados aún.</p>';
    return;
  }

  const rows = teams.map((team, i) => {
    const pos      = i + 1;
    const posClass = pos === 1 ? 'gold' : pos === 2 ? 'silver' : pos === 3 ? 'bronze' : '';
    const posIcon  = pos === 1 ? '🥇' : pos === 2 ? '🥈' : pos === 3 ? '🥉' : `#${pos}`;
    const completed = team.completedChallenges?.length || 0;
    const isMe      = currentTeam && team.id === currentTeam.id;
    return `
      <tr style="${isMe ? 'background:var(--cyan-dim);' : ''}">
        <td><span class="rank-pos ${posClass}">${posIcon}</span></td>
        <td>
          <span style="font-weight:600; color:${isMe ? 'var(--cyan)' : 'var(--text-primary)'};">
            ${escHtml(team.name)} ${isMe ? '<span style="font-size:0.65rem; color:var(--cyan);">(TÚ)</span>' : ''}
          </span>
        </td>
        <td><span class="rank-score">${team.score ?? 0}</span></td>
        <td class="col-hide-xs" style="color:var(--green);">${completed}</td>
        <td class="col-hide-sm" style="color:var(--text-muted); font-size:0.75rem;">${(team.members || []).join(', ') || '—'}</td>
      </tr>`;
  }).join('');

  document.getElementById('ranking-content').innerHTML = `
    <div class="ranking-wrap">
      <table class="ranking-table">
        <thead>
          <tr>
            <th style="width:48px;">#</th>
            <th>Equipo</th>
            <th style="width:100px;">Puntos</th>
            <th style="width:110px;" class="col-hide-xs">Resueltos</th>
            <th class="col-hide-sm">Integrantes</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
}

// ── Timer ──────────────────────────────────────────────────
async function startTimer() {
  if (timerInterval) clearInterval(timerInterval);
  const cfg = await Store.getConfig();
  if (!cfg.endTime) return;

  const timerEl   = document.getElementById('global-timer');
  const displayEl = document.getElementById('timer-display');
  timerEl.style.display = 'flex';

  function update() {
    const now  = new Date();
    const end  = new Date(cfg.endTime);
    const diff = end - now;

    if (diff <= 0) {
      displayEl.textContent = '00:00:00';
      timerEl.className = 'ended';
      timerEl.querySelector('.timer-dot').style.background = 'var(--red)';
      clearInterval(timerInterval);
      checkCompetitionStatus();
      return;
    }

    const h = Math.floor(diff / 3600000);
    const m = Math.floor((diff % 3600000) / 60000);
    const s = Math.floor((diff % 60000) / 1000);
    displayEl.textContent = `${pad(h)}:${pad(m)}:${pad(s)}`;
    if (diff < 300000) timerEl.classList.add('urgent');
  }

  update();
  timerInterval = setInterval(update, 1000);
}

async function checkCompetitionStatus() {
  if (!(await isCompActive())) {
    document.getElementById('ended-overlay').classList.add('active');
  }
}

function pad(n) { return n.toString().padStart(2, '0'); }

// ── Utilities ──────────────────────────────────────────────
function escHtml(str) {
  if (!str) return '';
  return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function showToast(msg, type = 'info') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icons = { success: '✅', error: '❌', info: 'ℹ️' };
  toast.innerHTML = `<span>${icons[type] || ''}</span><span>${msg}</span>`;
  container.appendChild(toast);
  setTimeout(() => { toast.style.opacity='0'; toast.style.transform='translateX(20px)'; toast.style.transition='0.3s'; setTimeout(()=>toast.remove(),300); }, 4000);
}

function showConfirm(title, msg, onConfirm) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal">
      <div class="modal-title">${title}</div>
      <p style="color:var(--text-secondary); margin-bottom:20px; font-size:0.88rem;">${msg}</p>
      <div style="display:flex; gap:10px; justify-content:flex-end;">
        <button class="btn btn-ghost" onclick="this.closest('.modal-overlay').remove()">Cancelar</button>
        <button class="btn btn-danger" id="confirm-ok-btn">Confirmar</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  overlay.querySelector('#confirm-ok-btn').addEventListener('click', () => {
    overlay.remove();
    onConfirm();
  });
}
