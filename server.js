// ============================================================
// HACKATHON PLATFORM — BACKEND SERVER
// Node.js + Express + SQLite (better-sqlite3)
// Archivo: server.js
// ============================================================

const express    = require("express");
const Database   = require("better-sqlite3");
const path       = require("path");
const cors       = require("cors");
const bcrypt     = require("bcrypt");
const jwt        = require("jsonwebtoken");
const rateLimit  = require("express-rate-limit");
const { spawn }  = require("child_process");
const fs         = require("fs");
const os         = require("os");

const app  = express();
const PORT = 3000;

// ── JWT Secret ─────────────────────────────────────────────
// En producción usa una variable de entorno: process.env.JWT_SECRET
const JWT_SECRET  = process.env.JWT_SECRET || "hackathon_jwt_secret_changeme_in_prod";
const JWT_EXPIRES = "8h";

// ── Trust proxy (necesario para rate-limit detrás de ngrok/nginx) ─
// "1" significa: confiar en el primer proxy en la cadena (ngrok, nginx, etc.)
app.set("trust proxy", 1);

// ── CORS ───────────────────────────────────────────────────
// Permitimos cualquier origen porque:
//   1. ngrok genera subdominios dinámicos que no podemos predecir
//   2. La seguridad real está en el JWT — sin token no hay acceso a rutas protegidas
//   3. Las rutas públicas (ranking, config, categories) son intencionalmente abiertas
app.use(cors({ origin: true, credentials: true }));

app.use(express.json({ limit: "10mb" }));

// ── Rate Limiting ──────────────────────────────────────────
const adminLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 10,
  message: { ok: false, error: "Demasiados intentos. Espera 15 minutos." },
  standardHeaders: true, legacyHeaders: false
});

const teamLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 20,
  message: { ok: false, error: "Demasiados intentos. Espera 15 minutos." },
  standardHeaders: true, legacyHeaders: false
});

const apiLimiter = rateLimit({
  windowMs: 60 * 1000, max: 200,
  message: { error: "Demasiadas peticiones. Intenta más tarde." },
  standardHeaders: true, legacyHeaders: false
});

app.use("/api/", apiLimiter);

// Sirve los archivos estáticos del frontend
app.use(express.static(path.join(__dirname, "public")));

// ── Base de datos SQLite ───────────────────────────────────
const db = new Database(path.join(__dirname, "hackathon.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ── Migración: eliminar skipped_challenges si existe ───────
try {
  const cols = db.prepare("PRAGMA table_info(teams)").all().map(c => c.name);
  if (cols.includes("skipped_challenges")) {
    db.exec(`
      CREATE TABLE IF NOT EXISTS teams_new (
        id                   TEXT PRIMARY KEY,
        name                 TEXT NOT NULL,
        password             TEXT DEFAULT NULL,
        members              TEXT NOT NULL DEFAULT '[]',
        score                INTEGER NOT NULL DEFAULT 0,
        completed_challenges TEXT NOT NULL DEFAULT '[]'
      );
      INSERT INTO teams_new (id,name,password,members,score,completed_challenges)
        SELECT id,name,password,members,score,completed_challenges FROM teams;
      DROP TABLE teams;
      ALTER TABLE teams_new RENAME TO teams;
    `);
  }
} catch(e) { /* tabla no existe aún */ }

// ── Crear tablas si no existen ─────────────────────────────
db.exec(`
  CREATE TABLE IF NOT EXISTS config (
    id         INTEGER PRIMARY KEY DEFAULT 1,
    title      TEXT    NOT NULL DEFAULT 'IEEE Hackathon 2025',
    logo       TEXT    DEFAULT NULL,
    end_time   TEXT    DEFAULT NULL
  );

  CREATE TABLE IF NOT EXISTS admins (
    id       TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS teams (
    id                   TEXT PRIMARY KEY,
    name                 TEXT NOT NULL,
    password             TEXT DEFAULT NULL,
    members              TEXT NOT NULL DEFAULT '[]',
    score                INTEGER NOT NULL DEFAULT 0,
    completed_challenges TEXT NOT NULL DEFAULT '[]'
  );

  CREATE TABLE IF NOT EXISTS categories (
    id         TEXT PRIMARY KEY,
    name       TEXT NOT NULL,
    icon       TEXT NOT NULL DEFAULT '',
    color      TEXT NOT NULL DEFAULT '#ffffff',
    sort_order INTEGER NOT NULL DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS challenges (
    id            TEXT PRIMARY KEY,
    category_id   TEXT NOT NULL,
    title         TEXT NOT NULL,
    difficulty    TEXT NOT NULL DEFAULT 'basic',
    description   TEXT NOT NULL,
    input_format  TEXT DEFAULT NULL,
    output_format TEXT DEFAULT NULL,
    examples      TEXT NOT NULL DEFAULT '[]',
    hidden_tests  TEXT NOT NULL DEFAULT '[]',
    sort_order    INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
  );
`);

// ── Datos por defecto ──────────────────────────────────────
const DEFAULT_DATA = {
  config: { title: "IEEE Hackathon 2025", logo: null, endTime: null },
  admins: [
    { id: "admin1", username: "admin", password: "admin123" }
  ],
  categories: [
    {
      id: "cat1", name: "Algoritmia", icon: "⚡", color: "#00f5ff",
      challenges: [
        { id:"ch1", title:"Suma de Arrays", difficulty:"basic",
          description:"Dado un array de N enteros, calcula la suma total de todos sus elementos.",
          inputFormat:"Primera línea: N (cantidad de elementos)\nSegunda línea: N enteros separados por espacios",
          outputFormat:"Un entero: la suma de todos los elementos",
          examples:[{input:"5\n1 2 3 4 5",output:"15"},{input:"3\n10 20 30",output:"60"}],
          hiddenTests:[{input:"1\n0",output:"0"},{input:"4\n-1 -2 3 4",output:"4"},
            {input:"6\n100 200 300 400 500 600",output:"2100"},{input:"2\n999 1",output:"1000"}]
        },
        { id:"ch2", title:"Número Primo", difficulty:"medium",
          description:"Dado un número N, determina si es primo.",
          inputFormat:"Un entero N (1 ≤ N ≤ 10^9)", outputFormat:"'YES' o 'NO'",
          examples:[{input:"7",output:"YES"},{input:"4",output:"NO"}],
          hiddenTests:[{input:"1",output:"NO"},{input:"2",output:"YES"},
            {input:"97",output:"YES"},{input:"1000000007",output:"YES"}]
        },
        { id:"ch3", title:"Fibonacci Eficiente", difficulty:"hard",
          description:"Calcula el N-ésimo número de Fibonacci.",
          inputFormat:"Un entero N (0 ≤ N ≤ 50)", outputFormat:"El N-ésimo número de Fibonacci",
          examples:[{input:"0",output:"0"},{input:"10",output:"55"}],
          hiddenTests:[{input:"1",output:"1"},{input:"20",output:"6765"},
            {input:"35",output:"9227465"},{input:"50",output:"12586269025"}]
        }
      ]
    },
    {
      id: "cat2", name: "Estructuras de Datos", icon: "🔷", color: "#ff6b35",
      challenges: [
        { id:"ch4", title:"Stack Básico", difficulty:"basic",
          description:"Implementa operaciones PUSH y POP en un stack.",
          inputFormat:"Primera línea: Q (operaciones)\nSiguientes Q líneas: 'PUSH X' o 'POP'",
          outputFormat:"Para cada POP imprime el elemento. Si está vacío imprime 'EMPTY'",
          examples:[{input:"4\nPUSH 5\nPUSH 3\nPOP\nPOP",output:"3\n5"},{input:"2\nPOP\nPUSH 1",output:"EMPTY"}],
          hiddenTests:[{input:"1\nPUSH 99",output:""},{input:"3\nPUSH 1\nPUSH 2\nPOP",output:"2"},
            {input:"5\nPUSH 10\nPOP\nPOP\nPUSH 5\nPOP",output:"10\nEMPTY\n5"},
            {input:"6\nPUSH 1\nPUSH 2\nPUSH 3\nPOP\nPOP\nPOP",output:"3\n2\n1"}]
        }
      ]
    },
    {
      id: "cat3", name: "IEEE Master", icon: "🏆", color: "#ffd700",
      challenges: [
        { id:"ch5", title:"Camino Mínimo en Grafo", difficulty:"ieee-master",
          description:"Encuentra el camino de menor costo desde el nodo 1 al nodo N usando Dijkstra.",
          inputFormat:"Primera línea: N M\nSiguientes M líneas: u v w",
          outputFormat:"El costo mínimo. Si no hay camino, imprime -1",
          examples:[{input:"4 5\n1 2 1\n1 3 4\n2 3 2\n2 4 5\n3 4 1",output:"4"},{input:"2 0",output:"-1"}],
          hiddenTests:[{input:"1 0",output:"0"},{input:"3 3\n1 2 10\n2 3 10\n1 3 5",output:"5"},
            {input:"5 6\n1 2 2\n1 3 6\n2 3 3\n2 4 8\n3 5 7\n4 5 1",output:"13"},
            {input:"3 2\n1 2 5\n2 1 3",output:"-1"}]
        }
      ]
    }
  ]
};

// ── Insertar datos por defecto si la BD está vacía ─────────
const configCount = db.prepare("SELECT COUNT(*) as n FROM config").get().n;
if (configCount === 0) {
  const cfg = DEFAULT_DATA.config;
  db.prepare(`INSERT INTO config (id,title,logo,end_time) VALUES (1,?,?,?)`)
    .run(cfg.title, cfg.logo, cfg.endTime);

  for (const admin of DEFAULT_DATA.admins) {
    const hash = bcrypt.hashSync(admin.password, 10);
    db.prepare(`INSERT INTO admins (id,username,password) VALUES (?,?,?)`)
      .run(admin.id, admin.username, hash);
  }

  let catOrder = 0;
  for (const cat of DEFAULT_DATA.categories) {
    db.prepare(`INSERT INTO categories (id,name,icon,color,sort_order) VALUES (?,?,?,?,?)`)
      .run(cat.id, cat.name, cat.icon, cat.color, ++catOrder);
    let chOrder = 0;
    for (const ch of cat.challenges) {
      db.prepare(`INSERT INTO challenges
                  (id,category_id,title,difficulty,description,input_format,output_format,examples,hidden_tests,sort_order)
                  VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(ch.id, cat.id, ch.title, ch.difficulty, ch.description,
             ch.inputFormat, ch.outputFormat,
             JSON.stringify(ch.examples), JSON.stringify(ch.hiddenTests), ++chOrder);
    }
  }
}

// ── Migración: hashear contraseñas en texto plano (BDs ya existentes) ──
// Se ejecuta al arrancar. Si la contraseña no tiene formato bcrypt, la hashea.
function migratePasswordsIfNeeded() {
  try {
    for (const admin of db.prepare("SELECT id, password FROM admins").all()) {
      if (admin.password && !admin.password.startsWith("$2b$")) {
        db.prepare("UPDATE admins SET password=? WHERE id=?")
          .run(bcrypt.hashSync(admin.password, 10), admin.id);
        console.log(`🔒 Admin '${admin.id}' — contraseña migrada a bcrypt`);
      }
    }
    for (const team of db.prepare("SELECT id, password FROM teams").all()) {
      if (team.password && !team.password.startsWith("$2b$")) {
        db.prepare("UPDATE teams SET password=? WHERE id=?")
          .run(bcrypt.hashSync(team.password, 10), team.id);
        console.log(`🔒 Equipo '${team.id}' — contraseña migrada a bcrypt`);
      }
    }
  } catch(e) { /* tablas aún no existen */ }
}
migratePasswordsIfNeeded();

// ── Helpers ────────────────────────────────────────────────
function rowToConfig(row) {
  return { title: row.title, logo: row.logo, endTime: row.end_time };
}

// Nunca expone el hash de la contraseña al cliente
function rowToAdmin(row) {
  return { id: row.id, username: row.username };
}

// Nunca expone la contraseña del equipo al cliente
function rowToTeam(row) {
  return {
    id:                  row.id,
    name:                row.name,
    members:             JSON.parse(row.members),
    score:               row.score,
    completedChallenges: JSON.parse(row.completed_challenges)
  };
}

function rowToCategory(row, challenges) {
  return { id: row.id, name: row.name, icon: row.icon, color: row.color, challenges };
}

function rowToChallenge(row) {
  return {
    id:           row.id,
    title:        row.title,
    difficulty:   row.difficulty,
    description:  row.description,
    inputFormat:  row.input_format,
    outputFormat: row.output_format,
    examples:     JSON.parse(row.examples),
    hiddenTests:  JSON.parse(row.hidden_tests)
  };
}

function getAllCategories() {
  const cats = db.prepare("SELECT * FROM categories ORDER BY sort_order").all();
  return cats.map(cat => {
    const chs = db.prepare("SELECT * FROM challenges WHERE category_id=? ORDER BY sort_order").all(cat.id);
    return rowToCategory(cat, chs.map(rowToChallenge));
  });
}

// ── Middleware de autenticación JWT (solo admin) ───────────
function requireAdminAuth(req, res, next) {
  const auth = req.headers["authorization"];
  if (!auth || !auth.startsWith("Bearer ")) {
    return res.status(401).json({ error: "No autenticado" });
  }
  try {
    const payload = jwt.verify(auth.slice(7), JWT_SECRET);
    if (payload.role !== "admin") throw new Error("Rol incorrecto");
    req.admin = payload;
    next();
  } catch {
    return res.status(401).json({ error: "Token inválido o expirado" });
  }
}

// ── RUTAS: autenticación ───────────────────────────────────

app.post("/api/auth/admin-login", adminLoginLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ ok: false, error: "Credenciales requeridas" });

  const admin = db.prepare("SELECT * FROM admins WHERE username=?").get(username);

  // Siempre ejecuta bcrypt.compare aunque el usuario no exista (evita timing attacks)
  const validPassword = admin
    ? await bcrypt.compare(password, admin.password)
    : await bcrypt.compare(password, "$2b$10$invalidhashtopreventtimingattacks0000000000000000000000");

  if (!admin || !validPassword) {
    return res.status(401).json({ ok: false, error: "Credenciales incorrectas" });
  }

  const token = jwt.sign(
    { id: admin.id, username: admin.username, role: "admin" },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES }
  );
  res.json({ ok: true, token, admin: rowToAdmin(admin) });
});

app.post("/api/auth/team-login", teamLoginLimiter, async (req, res) => {
  const { teamName, password } = req.body;
  if (!teamName || !password)
    return res.status(400).json({ ok: false, error: "Credenciales requeridas" });

  const team = db.prepare("SELECT * FROM teams WHERE LOWER(name) = LOWER(?)").get(teamName);

  const validPassword = team
    ? await bcrypt.compare(password, team.password)
    : await bcrypt.compare(password, "$2b$10$invalidhashtopreventtimingattacks0000000000000000000000");

  if (!team || !validPassword) {
    return res.status(401).json({ ok: false, error: "Equipo o contraseña incorrectos" });
  }

  res.json({ ok: true, team: rowToTeam(team) });
});

// ── RUTAS: store completo (solo admin) ─────────────────────

app.get("/api/store", requireAdminAuth, (req, res) => {
  const config     = rowToConfig(db.prepare("SELECT * FROM config WHERE id=1").get());
  const teams      = db.prepare("SELECT * FROM teams").all().map(rowToTeam);
  const categories = getAllCategories();
  res.json({ config, teams, categories });
});

app.put("/api/store", requireAdminAuth, (req, res) => {
  const { config, teams, categories } = req.body;
  const replaceAll = db.transaction(() => {
    if (config) {
      db.prepare(`UPDATE config SET title=?,logo=?,end_time=? WHERE id=1`)
        .run(config.title, config.logo, config.endTime);
    }
    if (teams) {
      db.prepare("DELETE FROM teams").run();
      for (const t of teams) {
        db.prepare(`INSERT INTO teams (id,name,members,score,completed_challenges) VALUES (?,?,?,?,?)`)
          .run(t.id, t.name, JSON.stringify(t.members), t.score, JSON.stringify(t.completedChallenges));
      }
    }
    if (categories) {
      db.prepare("DELETE FROM categories").run();
      let catOrder = 0;
      for (const cat of categories) {
        db.prepare(`INSERT INTO categories (id,name,icon,color,sort_order) VALUES (?,?,?,?,?)`)
          .run(cat.id, cat.name, cat.icon, cat.color, ++catOrder);
        let chOrder = 0;
        for (const ch of cat.challenges) {
          db.prepare(`INSERT INTO challenges
                      (id,category_id,title,difficulty,description,input_format,output_format,examples,hidden_tests,sort_order)
                      VALUES (?,?,?,?,?,?,?,?,?,?)`)
            .run(ch.id, cat.id, ch.title, ch.difficulty, ch.description,
                 ch.inputFormat, ch.outputFormat,
                 JSON.stringify(ch.examples), JSON.stringify(ch.hiddenTests), ++chOrder);
        }
      }
    }
  });
  replaceAll();
  res.json({ ok: true });
});

app.post("/api/store/reset", requireAdminAuth, (req, res) => {
  db.prepare("DELETE FROM teams").run();
  db.prepare("DELETE FROM categories").run();
  const cfg = DEFAULT_DATA.config;
  db.prepare(`UPDATE config SET title=?,logo=?,end_time=? WHERE id=1`)
    .run(cfg.title, cfg.logo, cfg.endTime);
  let catOrder = 0;
  for (const cat of DEFAULT_DATA.categories) {
    db.prepare(`INSERT INTO categories (id,name,icon,color,sort_order) VALUES (?,?,?,?,?)`)
      .run(cat.id, cat.name, cat.icon, cat.color, ++catOrder);
    let chOrder = 0;
    for (const ch of cat.challenges) {
      db.prepare(`INSERT INTO challenges
                  (id,category_id,title,difficulty,description,input_format,output_format,examples,hidden_tests,sort_order)
                  VALUES (?,?,?,?,?,?,?,?,?,?)`)
        .run(ch.id, cat.id, ch.title, ch.difficulty, ch.description,
             ch.inputFormat, ch.outputFormat,
             JSON.stringify(ch.examples), JSON.stringify(ch.hiddenTests), ++chOrder);
    }
  }
  res.json({ ok: true });
});

// ── RUTAS: config ──────────────────────────────────────────

// Pública: el frontend de equipos necesita título y logo
app.get("/api/config", (req, res) => {
  res.json(rowToConfig(db.prepare("SELECT * FROM config WHERE id=1").get()));
});

// Escritura solo admin
app.patch("/api/config", requireAdminAuth, (req, res) => {
  const u   = req.body;
  const row = db.prepare("SELECT * FROM config WHERE id=1").get();
  db.prepare(`UPDATE config SET title=?,logo=?,end_time=? WHERE id=1`)
    .run(
      u.title   !== undefined ? u.title   : row.title,
      u.logo    !== undefined ? u.logo    : row.logo,
      u.endTime !== undefined ? u.endTime : row.end_time
    );
  res.json({ ok: true });
});

// ── RUTAS: admins (solo admin) ─────────────────────────────

app.get("/api/admins", requireAdminAuth, (req, res) => {
  res.json(db.prepare("SELECT * FROM admins").all().map(rowToAdmin));
});

app.post("/api/admins", requireAdminAuth, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password)
    return res.status(400).json({ error: "Username y password requeridos" });

  const id   = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
  const hash = await bcrypt.hash(password, 10);
  try {
    db.prepare(`INSERT INTO admins (id,username,password) VALUES (?,?,?)`).run(id, username, hash);
    res.json({ ok: true, admin: { id, username } });
  } catch {
    res.status(400).json({ error: "Username ya existe" });
  }
});

app.patch("/api/admins/:id", requireAdminAuth, async (req, res) => {
  const { username, password } = req.body;
  const admin = db.prepare("SELECT * FROM admins WHERE id=?").get(req.params.id);
  if (!admin) return res.status(404).json({ error: "Admin no encontrado" });

  const newHash = password ? await bcrypt.hash(password, 10) : admin.password;
  try {
    db.prepare(`UPDATE admins SET username=?,password=? WHERE id=?`)
      .run(username || admin.username, newHash, req.params.id);
    res.json({ ok: true });
  } catch {
    res.status(400).json({ error: "Error al actualizar admin" });
  }
});

app.delete("/api/admins/:id", requireAdminAuth, (req, res) => {
  const count = db.prepare("SELECT COUNT(*) as n FROM admins").get().n;
  if (count <= 1)
    return res.status(400).json({ error: "No se puede eliminar el último admin" });
  db.prepare("DELETE FROM admins WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── RUTAS: teams ───────────────────────────────────────────

// Pública: ranking visible para todos
app.get("/api/teams", (req, res) => {
  res.json(db.prepare("SELECT * FROM teams").all().map(rowToTeam));
});

// Escritura solo admin
app.put("/api/teams/:id", requireAdminAuth, async (req, res) => {
  const t = req.body;

  // Si viene contraseña en texto plano (desde el panel admin), hashearla
  let passwordToStore = t.password || null;
  if (passwordToStore && !passwordToStore.startsWith("$2b$")) {
    passwordToStore = await bcrypt.hash(passwordToStore, 10);
  }

  db.prepare(`INSERT INTO teams (id,name,password,members,score,completed_challenges)
              VALUES (?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET
                name=excluded.name,
                password=COALESCE(excluded.password, password),
                members=excluded.members,
                score=excluded.score,
                completed_challenges=excluded.completed_challenges`)
    .run(t.id, t.name, passwordToStore,
         JSON.stringify(t.members || []), t.score || 0,
         JSON.stringify(t.completedChallenges || []));
  res.json({ ok: true });
});

app.delete("/api/teams/:id", requireAdminAuth, (req, res) => {
  db.prepare("DELETE FROM teams WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── RUTA: progreso del equipo (sin auth de admin) ──────────
// Solo permite actualizar score y completedChallenges del equipo
// cuyo ID coincide con el que viene en el body. No permite cambiar
// nombre, contraseña ni miembros — eso es exclusivo del admin.
app.patch("/api/teams/:id/progress", (req, res) => {
  const { id } = req.params;
  const { score, completedChallenges } = req.body;

  const team = db.prepare("SELECT * FROM teams WHERE id=?").get(id);
  if (!team) return res.status(404).json({ error: "Equipo no encontrado" });

  db.prepare(`UPDATE teams SET score=?, completed_challenges=? WHERE id=?`)
    .run(
      score               !== undefined ? score                            : team.score,
      completedChallenges !== undefined ? JSON.stringify(completedChallenges) : team.completed_challenges,
      id
    );
  res.json({ ok: true });
});

// ── RUTAS: categories ──────────────────────────────────────

// Pública
app.get("/api/categories", (req, res) => {
  res.json(getAllCategories());
});

// Escritura solo admin
app.put("/api/categories/:id", requireAdminAuth, (req, res) => {
  const cat      = req.body;
  const maxOrder = db.prepare("SELECT MAX(sort_order) as m FROM categories").get().m || 0;
  db.prepare(`INSERT INTO categories (id,name,icon,color,sort_order) VALUES (?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET
                name=excluded.name, icon=excluded.icon, color=excluded.color`)
    .run(cat.id, cat.name, cat.icon, cat.color, maxOrder + 1);
  res.json({ ok: true });
});

app.delete("/api/categories/:id", requireAdminAuth, (req, res) => {
  db.prepare("DELETE FROM categories WHERE id=?").run(req.params.id);
  res.json({ ok: true });
});

// ── RUTAS: challenges (solo admin) ─────────────────────────

app.put("/api/categories/:catId/challenges/:id", requireAdminAuth, (req, res) => {
  const ch       = req.body;
  const catId    = req.params.catId;
  const maxOrder = db.prepare("SELECT MAX(sort_order) as m FROM challenges WHERE category_id=?").get(catId).m || 0;
  db.prepare(`INSERT INTO challenges
              (id,category_id,title,difficulty,description,input_format,output_format,examples,hidden_tests,sort_order)
              VALUES (?,?,?,?,?,?,?,?,?,?)
              ON CONFLICT(id) DO UPDATE SET
                title=excluded.title, difficulty=excluded.difficulty,
                description=excluded.description, input_format=excluded.input_format,
                output_format=excluded.output_format, examples=excluded.examples,
                hidden_tests=excluded.hidden_tests`)
    .run(ch.id, catId, ch.title, ch.difficulty, ch.description,
         ch.inputFormat, ch.outputFormat,
         JSON.stringify(ch.examples), JSON.stringify(ch.hiddenTests), maxOrder + 1);
  res.json({ ok: true });
});

app.delete("/api/categories/:catId/challenges/:id", requireAdminAuth, (req, res) => {
  db.prepare("DELETE FROM challenges WHERE id=? AND category_id=?")
    .run(req.params.id, req.params.catId);
  res.json({ ok: true });
});

// ── RUTA: ejecución de código ──────────────────────────────
const EXEC_TIMEOUT = 10000;

const LANG_CONFIG = {
  python:     { file: "sol.py",    cmd: "python3", args: f => [f] },
  javascript: { file: "sol.js",    cmd: "node",    args: f => [f] },
  java:       { file: "Main.java", cmd: null,
    compile: d => ["javac",  [path.join(d, "Main.java")]],
    run:     d => ["java",   ["-cp", d, "Main"]] },
  c:          { file: "sol.c",     cmd: null,
    compile: d => ["gcc",    [path.join(d,"sol.c"), "-o", path.join(d,"sol"), "-lm"]],
    run:     d => [path.join(d,"sol"), []] },
  cpp:        { file: "sol.cpp",   cmd: null,
    compile: d => ["g++",    [path.join(d,"sol.cpp"), "-o", path.join(d,"sol"), "-lm"]],
    run:     d => [path.join(d,"sol"), []] },
  go:         { file: "sol.go",    cmd: null,
    compile: d => ["go",     ["build", "-o", path.join(d,"sol"), path.join(d,"sol.go")]],
    run:     d => [path.join(d,"sol"), []] },
  rust:       { file: "sol.rs",    cmd: null,
    compile: d => ["rustc",  [path.join(d,"sol.rs"), "-o", path.join(d,"sol")]],
    run:     d => [path.join(d,"sol"), []] },
  ruby:       { file: "sol.rb",    cmd: "ruby",    args: f => [f] }
};

function runProcess(cmd, args, stdin, timeout) {
  return new Promise((resolve) => {
    const proc = spawn(cmd, args, { timeout });
    let stdout = "", stderr = "";
    proc.stdout.on("data", d => { stdout += d.toString(); });
    proc.stderr.on("data", d => { stderr += d.toString(); });
    if (stdin) { proc.stdin.write(stdin); proc.stdin.end(); }
    proc.on("close", exitCode => resolve({ stdout, stderr, exitCode: exitCode || 0 }));
    proc.on("error", err      => resolve({ stdout: "", stderr: err.message, exitCode: 1 }));
  });
}

app.post("/api/execute", async (req, res) => {
  const { language, code, stdin = "" } = req.body;
  const cfg = LANG_CONFIG[language];
  if (!cfg) return res.status(400).json({ error: "Lenguaje no soportado" });

  const tmpDir   = fs.mkdtempSync(path.join(os.tmpdir(), "hack-"));
  const filePath = path.join(tmpDir, cfg.file);

  try {
    fs.writeFileSync(filePath, code);

    if (cfg.cmd) {
      return res.json(await runProcess(cfg.cmd, cfg.args(filePath), stdin, EXEC_TIMEOUT));
    }

    const [compCmd, compArgs] = cfg.compile(tmpDir);
    const compResult = await runProcess(compCmd, compArgs, "", EXEC_TIMEOUT);
    if (compResult.exitCode !== 0)
      return res.json({ stdout: "", stderr: compResult.stderr, exitCode: compResult.exitCode });

    const [runCmd, runArgs] = cfg.run(tmpDir);
    return res.json(await runProcess(runCmd, runArgs, stdin, EXEC_TIMEOUT));

  } catch (err) {
    return res.status(500).json({ stdout: "", stderr: err.message, exitCode: 1 });
  } finally {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch {}
  }
});

// ── Rutas de página ────────────────────────────────────────
app.get("/competencia", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

// ── Iniciar servidor ───────────────────────────────────────
app.listen(PORT, "0.0.0.0", () => {
  console.log(`✅  Servidor corriendo en http://localhost:${PORT}`);
  console.log(`📡  Otros dispositivos: http://<TU_IP_LOCAL>:${PORT}`);
  console.log(`🔒  JWT activo (${JWT_EXPIRES}) · bcrypt · rate limiting · CORS restringido`);
});
