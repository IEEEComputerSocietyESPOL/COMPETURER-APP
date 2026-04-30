# 🏆 IEEE Hackathon Platform

Plataforma web completa para organizar y gestionar competencias de programación tipo hackathon. Permite a los equipos resolver desafíos de código en tiempo real, con ejecución de código en múltiples lenguajes, ranking en vivo y seguimiento de rendimiento individual por estudiante.

---

## 📋 Tabla de Contenidos

- [Características](#-características)
- [Tecnologías](#-tecnologías)
- [Requisitos del sistema](#-requisitos-del-sistema)
- [Instalación](#-instalación)
- [Configuración inicial](#-configuración-inicial)
- [Estructura del proyecto](#-estructura-del-proyecto)
- [Uso](#-uso)
- [API Reference](#-api-reference)
- [Seguridad](#-seguridad)
- [Despliegue en red local](#-despliegue-en-red-local)
- [Acceso remoto con ngrok](#-acceso-remoto-con-ngrok)

---

## ✨ Características

### Para los equipos
- 🔐 Login por equipo con nombre y contraseña
- 💻 Editor de código Monaco (el mismo de VS Code) con syntax highlighting
- ⚡ Ejecución de código en 8 lenguajes de programación
- ✅ Sistema de casos de prueba visibles y ocultos
- 📊 Dashboard con progreso por categoría
- 🏆 Ranking en tiempo real
- ⏱️ Temporizador global con cuenta regresiva

### Para el administrador
- ⚙️ Panel de administración protegido por JWT
- 👥 Gestión de equipos e integrantes (CRUD + importación JSON)
- 📁 Gestión de categorías y desafíos con importación masiva
- 🧩 Editor de desafíos con casos de prueba visibles y ocultos
- 🏆 Ranking en tiempo real con opción de reset
- 📊 **Panel de rendimiento individual:** muestra el porcentaje de participación de cada estudiante por desafío y categoría
- 🛡️ Gestión de múltiples administradores

### Sistema de contribuciones
Cuando un equipo resuelve un desafío correctamente, aparece una ventana emergente donde los integrantes marcan quiénes participaron en esa solución. Esto alimenta el panel de rendimiento del administrador con métricas como:
- % de desafíos del equipo en los que participó cada estudiante
- % de participación por ejercicio (si 2 de 4 integrantes lo resolvieron → 50% cada uno)
- Desglose por categoría con dificultad de cada desafío

---

## 🛠 Tecnologías

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js + Express |
| Base de datos | SQLite (better-sqlite3) |
| Autenticación | JWT + bcrypt |
| Editor de código | Monaco Editor 0.44.0 |
| Ejecución de código | Subprocesos del sistema operativo |
| Frontend | HTML5 + CSS3 + JavaScript vanilla |

---

## 💻 Requisitos del sistema

- **Node.js** v18 o superior
- **npm** v8 o superior
- Compiladores instalados en el servidor para los lenguajes que desees soportar:

| Lenguaje | Comando requerido |
|----------|------------------|
| Python 3 | `python3` |
| JavaScript | `node` |
| Java | `javac` + `java` |
| C | `gcc` |
| C++ | `g++` |
| Go | `go` |
| Rust | `rustc` |
| Ruby | `ruby` |

> **Nota:** Los lenguajes cuyos compiladores no estén instalados simplemente devolverán un error de ejecución al intentar usarlos. El resto de la plataforma funciona sin problema.

---

## 🚀 Instalación

**1. Clona o descarga el repositorio**

```bash
git clone https://github.com/tu-usuario/ieee-hackathon-platform.git
cd ieee-hackathon-platform
```

**2. Instala las dependencias**

```bash
npm install
```

Las dependencias principales son:

```json
{
  "better-sqlite3": "^9.x",
  "bcrypt": "^5.x",
  "cors": "^2.x",
  "express": "^4.x",
  "express-rate-limit": "^7.x",
  "jsonwebtoken": "^9.x"
}
```

**3. Inicia el servidor**

```bash
node server.js
```

El servidor corre en `http://localhost:3000` por defecto.

**4. Accede a la plataforma**

| URL | Descripción |
|-----|-------------|
| `http://localhost:3000/competencia` | Vista de equipos (participantes) |
| `http://localhost:3000/admin` | Panel de administración |

---

## ⚙️ Configuración inicial

Al iniciar por primera vez, la base de datos se crea automáticamente con datos de ejemplo:

**Administrador por defecto:**
```
Usuario:    admin
Contraseña: admin123
```
> ⚠️ **Cambia esta contraseña inmediatamente** desde el panel de administración → pestaña Administradores.

**Equipo de ejemplo:** No hay equipos creados. El administrador debe crearlos antes de la competencia.

### Variables de entorno

El único parámetro configurable por variable de entorno es el secreto JWT:

```bash
JWT_SECRET=mi_secreto_super_seguro node server.js
```

Si no se define, usa un valor por defecto. En producción **siempre** define esta variable.

### Cambiar el puerto

En `server.js`, línea 19:

```js
const PORT = 3000; // cambia aquí
```

---

## 📂 Estructura del proyecto

```
ieee-hackathon-platform/
├── server.js              # Backend: Express + SQLite + ejecución de código
├── package.json
├── hackathon.db           # Base de datos SQLite (se crea automáticamente)
└── public/
    ├── index.html         # Vista de equipos / competencia
    ├── admin.html         # Panel de administración
    ├── css/
    │   └── main.css       # Estilos globales (tema oscuro cyberpunk)
    ├── js/
    │   ├── store.js       # Cliente API (todas las llamadas al backend)
    │   ├── runner.js      # Motor de ejecución de código
    │   ├── user.js        # Lógica del frontend de equipos
    │   └── admin.js       # Lógica del panel de administración
    └── resources/
        └── *.ico          # Favicon y recursos estáticos
```

---

## 📖 Uso

### Flujo de una competencia típica

**Antes de la competencia (administrador):**

1. Entrar al panel admin → **Config**: establece el nombre, logo y hora de fin.
2. **Categorías**: crea las categorías de desafíos (ej. Algoritmia, Estructuras de Datos).
3. **Desafíos**: agrega desafíos a cada categoría con sus casos de prueba visibles y ocultos.
4. **Equipos**: registra los equipos con sus integrantes y contraseñas.

**Durante la competencia (equipos):**

1. Los equipos acceden a `/competencia` e ingresan con su nombre y contraseña.
2. Seleccionan un desafío en la barra lateral.
3. Escriben su solución en el editor Monaco.
4. Usan **"Solo Probar"** para verificar sin enviar, o **"Enviar Solución"** para competir.
5. Si la solución es correcta, aparece una ventana pidiendo que marquen quiénes participaron.
6. Los puntos se suman automáticamente al marcador del equipo.

**Al finalizar (administrador):**

- Ver resultados en **Ranking**.
- Analizar el rendimiento individual en **Rendimiento** → ver por estudiante cuántos desafíos resolvió y su porcentaje de participación por categoría.

### Importar equipos desde JSON

Formato esperado:

```json
[
  {
    "name": "Team Alpha",
    "password": "pass123",
    "members": ["Juan Pérez", "María García", "Carlos López"]
  },
  {
    "name": "Team Beta",
    "password": "pass456",
    "members": "Ana Torres, Luis Mora"
  }
]
```

El campo `members` acepta tanto array como string separado por comas.

### Importar desafíos desde JSON

```json
[
  {
    "title": "Suma de Arrays",
    "category": "Algoritmia",
    "difficulty": "basic",
    "description": "Dado un array de N enteros, calcula la suma total.",
    "inputFormat": "Primera línea: N\nSegunda línea: N enteros",
    "outputFormat": "Un entero: la suma",
    "examples": [
      { "input": "5\n1 2 3 4 5", "output": "15" }
    ],
    "hiddenTests": [
      { "input": "3\n10 20 30", "output": "60" }
    ]
  }
]
```

Valores válidos para `difficulty`: `basic`, `medium`, `hard`, `ieee-master`.

| Dificultad | Puntos | Ícono |
|-----------|--------|-------|
| basic | 1 | ⭐ |
| medium | 2 | ⭐⭐ |
| hard | 3 | ⭐⭐⭐ |
| ieee-master | 5 | 👑 |

---

## 🔌 API Reference

Todas las rutas tienen el prefijo `/api`.

### Autenticación

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/auth/admin-login` | Pública | Login de administrador → devuelve JWT |
| POST | `/auth/team-login` | Pública | Login de equipo → devuelve datos del equipo |

### Configuración

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/config` | Pública | Obtener configuración (título, logo, tiempo) |
| PATCH | `/config` | Admin | Actualizar configuración |

### Equipos

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/teams` | Pública | Listar equipos (para ranking) |
| PUT | `/teams/:id` | Admin | Crear o actualizar equipo |
| DELETE | `/teams/:id` | Admin | Eliminar equipo |
| PATCH | `/teams/:id/progress` | Pública* | Actualizar puntaje y desafíos completados |
| POST | `/teams/:id/contributions` | Pública* | Registrar quiénes trabajaron en un desafío |

> *Pública pero solo puede actualizar el propio equipo (sin posibilidad de modificar nombre o contraseña).

### Categorías y desafíos

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/categories` | Pública | Listar categorías con sus desafíos |
| PUT | `/categories/:id` | Admin | Crear o actualizar categoría |
| DELETE | `/categories/:id` | Admin | Eliminar categoría (y sus desafíos) |
| PUT | `/categories/:catId/challenges/:id` | Admin | Crear o actualizar desafío |
| DELETE | `/categories/:catId/challenges/:id` | Admin | Eliminar desafío |

### Rendimiento

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/contributions` | Admin | Listar todas las contribuciones con contexto de equipo/desafío/categoría |

### Ejecución de código

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/execute` | Pública | Ejecutar código y devolver stdout/stderr/exitCode |

**Body de `/execute`:**
```json
{
  "language": "python",
  "code": "print('hello')",
  "stdin": ""
}
```

**Lenguajes soportados:** `python`, `javascript`, `java`, `c`, `cpp`, `go`, `rust`, `ruby`

---

## 🔒 Seguridad

La plataforma implementa varias capas de seguridad:

- **JWT (8 horas de vigencia):** todas las rutas de escritura del admin requieren un token válido. Si el token expira, la sesión se cierra automáticamente.
- **bcrypt:** las contraseñas de administradores y equipos se almacenan hasheadas (factor 10). Las contraseñas en texto plano existentes en la BD se migran automáticamente al arrancar.
- **Rate limiting:**
  - Login admin: 10 intentos / 15 minutos
  - Login equipo: 20 intentos / 15 minutos
  - API general: 200 requests / minuto
- **Separación de rutas:** los equipos solo pueden actualizar su propio puntaje y desafíos completados, nunca su contraseña ni los datos de otros equipos.
- **Ejecución de código aislada:** cada ejecución crea un directorio temporal que se elimina tras finalizar. Timeout de 10 segundos por ejecución.

---

## 🌐 Despliegue en red local

Para que participantes en otras máquinas de la misma red accedan a la plataforma:

**1. Obtén tu IP local:**

```bash
# Linux / macOS
ip addr show   # o: hostname -I

# Windows
ipconfig
```

**2. Los participantes acceden desde su navegador:**

```
http://192.168.1.XX:3000/competencia
```

**3. (Opcional) Actualiza `API_BASE` en `store.js`:**

Si los equipos abren el HTML directamente desde el sistema de archivos (sin servidor web), cambia:

```js
// store.js, línea ~17
const API_BASE = "http://192.168.1.XX:3000/api";
```

---

## 🌍 Acceso remoto con ngrok

Para permitir acceso desde fuera de la red local:

```bash
# Instalar ngrok: https://ngrok.com/download
ngrok http 3000
```

ngrok proporciona una URL pública tipo `https://abc123.ngrok-free.app`. Compártela con los participantes. El servidor ya está configurado con `trust proxy` para funcionar correctamente detrás de ngrok.

---

## 🐛 Solución de problemas comunes

**El servidor no inicia — error de módulos:**
```bash
npm install   # reinstala dependencias
```

**"Lenguaje no soportado" al ejecutar código:**
Verifica que el compilador esté instalado:
```bash
python3 --version
node --version
javac --version
gcc --version
```

**La base de datos está corrupta:**
Elimina `hackathon.db` y reinicia el servidor. Se recreará con los datos de ejemplo. ⚠️ Se perderán todos los datos.

**Token expirado en el panel admin:**
Los tokens duran 8 horas. Si expira durante una sesión, cierra sesión y vuelve a entrar.

**Los equipos no pueden acceder desde otra máquina:**
Verifica que el firewall permita conexiones entrantes al puerto 3000:
```bash
# Ubuntu/Debian
sudo ufw allow 3000
```

---

## 📄 Licencia

Este proyecto fue desarrollado para competencias internas de **IEEE Computer Society ESPOL**. Libre para uso educativo y adaptación.

---

*Desarrollado con ⚡ para IEEE Computer Society ESPOL*
