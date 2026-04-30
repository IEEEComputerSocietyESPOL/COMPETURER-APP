// ============================================================
// HACKATHON PLATFORM - SHARED DATA STORE
// Versión con backend local (Node.js + SQLite)
// ============================================================

const DEFAULT_DATA = {
  config: {
    title: "IEEE Hackathon 2025",
    logo: null,
    endTime: null
  },
  teams: [],
  categories: []
};

// ============================================================
// URL del backend
// Si el frontend está abierto en OTRA máquina de la red, cambia esto:
// const API_BASE = "http://192.168.1.XX:3000/api";
// ============================================================
const API_BASE = "/api";

async function _apiFetch(endpoint, options = {}) {
  const headers = { "Content-Type": "application/json", ...options.headers };

  // Si hay un token de admin en sessionStorage, lo adjuntamos automáticamente.
  // Las rutas públicas (GET /api/config, GET /api/teams, GET /api/categories,
  // POST /api/auth/*) lo ignoran; las rutas protegidas lo requieren.
  const token = sessionStorage.getItem("admin_token");
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(`${API_BASE}${endpoint}`, { headers, ...options });
  if (!res.ok) throw new Error(`API error ${res.status}: ${endpoint}`);
  return res.json();
}

// ============================================================
// Storage API — mismos nombres de métodos que la versión original
// ============================================================
const Store = {
  async get() {
    try { return await _apiFetch("/store"); }
    catch { return JSON.parse(JSON.stringify(DEFAULT_DATA)); }
  },
  async save(data) {
    await _apiFetch("/store", { method: "PUT", body: JSON.stringify(data) });
  },
  async reset() {
    await _apiFetch("/store/reset", { method: "POST" });
  },
  async getConfig() {
    try { return await _apiFetch("/config"); }
    catch { return JSON.parse(JSON.stringify(DEFAULT_DATA.config)); }
  },
  async getTeams() {
    try { return await _apiFetch("/teams"); }
    catch { return []; }
  },
  async getCategories() {
    try { return await _apiFetch("/categories"); }
    catch { return []; }
  },
  async updateConfig(updates) {
    await _apiFetch("/config", { method: "PATCH", body: JSON.stringify(updates) });
  },
  async saveTeam(team) {
    // Si hay token de admin, usa la ruta completa (puede cambiar nombre, password, etc.)
    // Si no hay token (equipo jugando), usa la ruta de progreso que solo actualiza score y challenges
    const token = sessionStorage.getItem("admin_token");
    if (token) {
      await _apiFetch(`/teams/${team.id}`, { method: "PUT", body: JSON.stringify(team) });
    } else {
      await _apiFetch(`/teams/${team.id}/progress`, {
        method: "PATCH",
        body: JSON.stringify({
          score: team.score,
          completedChallenges: team.completedChallenges
        })
      });
    }
  },
  async deleteTeam(id) {
    await _apiFetch(`/teams/${id}`, { method: "DELETE" });
  },
  async saveCategory(cat) {
    await _apiFetch(`/categories/${cat.id}`, { method: "PUT", body: JSON.stringify(cat) });
  },
  async deleteCategory(id) {
    await _apiFetch(`/categories/${id}`, { method: "DELETE" });
  },
  async saveChallenge(catId, challenge) {
    await _apiFetch(`/categories/${catId}/challenges/${challenge.id}`,
      { method: "PUT", body: JSON.stringify(challenge) });
  },
  async deleteChallenge(catId, challengeId) {
    await _apiFetch(`/categories/${catId}/challenges/${challengeId}`, { method: "DELETE" });
  },
  async saveContributions(teamId, challengeId, members) {
    await _apiFetch(`/teams/${teamId}/contributions`, {
      method: "POST",
      body: JSON.stringify({ challengeId, members })
    });
  },
  async getContributions() {
    try { return await _apiFetch("/contributions"); }
    catch { return []; }
  }
};

// ============================================================
// Difficulty config — sin cambios
// ============================================================
const DIFFICULTY = {
  basic:         { label: "Básico",      points: 1, color: "#4ade80", icon: "⭐" },
  medium:        { label: "Medio",       points: 2, color: "#facc15", icon: "⭐⭐" },
  hard:          { label: "Difícil",     points: 3, color: "#fb923c", icon: "⭐⭐⭐" },
  "ieee-master": { label: "IEEE Master", points: 5, color: "#c084fc", icon: "👑" }
};

// Generate unique IDs — sin cambios
function genId() {
  return Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
}

// Ahora son async porque getConfig/getTeams lo son
async function isCompActive() {
  const cfg = await Store.getConfig();
  if (!cfg.endTime) return true;
  return new Date() < new Date(cfg.endTime);
}

async function getCurrentTeam() {
  const id = sessionStorage.getItem("team_id");
  if (!id) return null;
  const teams = await Store.getTeams();
  return teams.find(t => t.id === id) || null;
}

function setCurrentTeam(team) {
  if (team) sessionStorage.setItem("team_id", team.id);
  else sessionStorage.removeItem("team_id");
}
