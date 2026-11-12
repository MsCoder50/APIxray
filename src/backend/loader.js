import fs from 'fs';
import path from "path";

function checkCodeForPythonFramework(projectPath) {
  const candidateFiles = [
    "main.py",
    "app.py",
    "server.py",
    "api.py",
    "index.py",
    "wsgi.py",
    "asgi.py",
    path.join("src", "main.py"),
    path.join("src", "app.py"),
    path.join("src", "server.py"),
    path.join("src", "api.py"),
    path.join("app", "main.py"),
    path.join("app", "app.py"),
    path.join("app", "api.py")
  ];

  // Also check any top-level .py file
  try {
    const rootItems = fs.readdirSync(projectPath);
    for (const item of rootItems) {
      if (item.endsWith('.py') && !candidateFiles.includes(item)) {
        candidateFiles.push(item);
      }
    }
  } catch (_) {}

  let foundFastApi = false;
  let foundFlask = false;

  for (const relPath of candidateFiles) {
    const fullPath = path.join(projectPath, relPath);
    if (!fs.existsSync(fullPath)) continue;

    try {
      const content = fs.readFileSync(fullPath, "utf-8");
      if (
        /from\s+fastapi\b/i.test(content) ||
        /import\s+fastapi\b/i.test(content) ||
        /\bFastAPI\s*\(/i.test(content)
      ) {
        foundFastApi = true;
      }
      if (
        /from\s+flask\b/i.test(content) ||
        /import\s+flask\b/i.test(content) ||
        /\bFlask\s*\(/i.test(content)
      ) {
        foundFlask = true;
      }

      if (foundFastApi && !foundFlask) return "fastapi";
      if (foundFlask && !foundFastApi) return "flask";
    } catch (_) {}
  }

  if (foundFastApi) return "fastapi";
  if (foundFlask) return "flask";
  return null;
}

export function detectProjectType(projectPath) {
  try {
    // 1. Check Node.js projects (package.json)
    const packageJsonPath = path.join(projectPath, "package.json");
    if (fs.existsSync(packageJsonPath)) {
      try {
        const packageJson = JSON.parse(
          fs.readFileSync(packageJsonPath, "utf-8")
        );
        const deps = {
          ...packageJson.dependencies,
          ...packageJson.devDependencies,
        };

        if (deps.next) return "nextjs";
        if (deps.express) return "express";
      } catch (err) {
        console.warn("Could not parse package.json, continuing framework checks:", err);
      }
    }

    // 2. Check Python dependency files
    const pythonDepFiles = [
      "requirements.txt",
      "Pipfile",
      "pyproject.toml",
      "setup.py",
      "setup.cfg"
    ];

    let combinedDepContent = "";
    for (const file of pythonDepFiles) {
      const p = path.join(projectPath, file);
      if (fs.existsSync(p)) {
        try {
          combinedDepContent += "\n" + fs.readFileSync(p, "utf-8").toLowerCase();
        } catch (_) {}
      }
    }

    if (combinedDepContent) {
      const hasFastApi = /\bfastapi\b/.test(combinedDepContent);
      const hasFlask = /\bflask\b/.test(combinedDepContent);

      if (hasFastApi && !hasFlask) return "fastapi";
      if (hasFlask && !hasFastApi) return "flask";
      if (hasFastApi && hasFlask) {
        return checkCodeForPythonFramework(projectPath) || "fastapi";
      }
    }

    // 3. Fallback: inspect Python source code files
    const codeDetected = checkCodeForPythonFramework(projectPath);
    if (codeDetected) return codeDetected;

    return "other";
  } catch (err) {
    console.error("Error detecting project:", err);
    return "other";
  }
}
