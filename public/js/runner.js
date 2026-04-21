// ============================================================
// CODE EXECUTION ENGINE - Frontend (Backend Local)
// Llama a /api/execute en el servidor Node.js
// ============================================================

const LANGUAGES = {
  python: { id: "python", name: "Python 3", monacoId: "python", ext: ".py" },
  javascript: { id: "javascript", name: "JavaScript (Node)", monacoId: "javascript", ext: ".js" },
  java: { id: "java", name: "Java", monacoId: "java", ext: ".java" },
  c: { id: "c", name: "C (GCC)", monacoId: "c", ext: ".c" },
  cpp: { id: "cpp", name: "C++", monacoId: "cpp", ext: ".cpp" },
  go: { id: "go", name: "Go", monacoId: "go", ext: ".go" },
  rust: { id: "rust", name: "Rust", monacoId: "rust", ext: ".rs" },
  ruby: { id: "ruby", name: "Ruby", monacoId: "ruby", ext: ".rb" }
};

async function runCode(language, code, stdin = "") {
  const lang = LANGUAGES[language];
  if (!lang) throw new Error("Lenguaje no soportado");

  try {
    const response = await fetch("/api/execute", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        language: language,
        code: code,
        stdin: stdin || ""
      })
    });

    if (!response.ok) {
      throw new Error(`Error HTTP ${response.status}`);
    }

    const result = await response.json();
    
    return {
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      exitCode: result.exitCode || 0,
      signal: null
    };
  } catch (error) {
    throw new Error(`Error en servidor de ejecución: ${error.message}`);
  }
}

function normalizeOutput(str) {
  return str.trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

async function runTestSuite(language, code, challenge) {
  const results = [];
  
  // Run visible examples first (2)
  for (let i = 0; i < Math.min(2, challenge.examples.length); i++) {
    const ex = challenge.examples[i];
    try {
      const res = await runCode(language, code, ex.input);
      const actual = normalizeOutput(res.stdout);
      const expected = normalizeOutput(ex.output);
      const passed = actual === expected;
      results.push({
        type: "example",
        index: i + 1,
        input: ex.input,
        expected,
        actual,
        stderr: res.stderr,
        passed,
        visible: true
      });
    } catch (e) {
      results.push({
        type: "example",
        index: i + 1,
        input: ex.input,
        expected: ex.output,
        actual: "",
        stderr: e.message,
        passed: false,
        visible: true
      });
    }
  }

  // Run hidden tests (up to 6 but show only pass/fail)
  const hidden = challenge.hiddenTests || [];
  for (let i = 0; i < Math.min(6, hidden.length); i++) {
    const test = hidden[i];
    try {
      const res = await runCode(language, code, test.input);
      const actual = normalizeOutput(res.stdout);
      const expected = normalizeOutput(test.output);
      const passed = actual === expected;
      results.push({
        type: "hidden",
        index: i + 1,
        input: "***", // hidden
        expected: "***",
        actual: passed ? "✓" : "✗",
        stderr: res.stderr,
        passed,
        visible: false
      });
    } catch (e) {
      results.push({
        type: "hidden",
        index: i + 1,
        input: "***",
        expected: "***",
        actual: "✗",
        stderr: "",
        passed: false,
        visible: false
      });
    }
  }

  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const allPassed = passed === total;

  return { results, total, passed, allPassed };
}
