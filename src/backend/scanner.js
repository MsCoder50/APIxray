import fs from "fs";
import path from "path";

const IGNORED_DIRS = new Set([
  'node_modules',
  '.git',
  '.venv',
  'venv',
  'env',
  '.env',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'dist',
  'build',
  'out',
  '.vite',
  '.next',
  '.nuxt',
  'public',
  'assets',
  'coverage',
  '.idea',
  '.vscode'
]);

function walk(dir, callback) {
  try {
    const files = fs.readdirSync(dir);

    for (const file of files) {
      if (IGNORED_DIRS.has(file)) continue;
      if (file.startsWith('.') && file !== '.env') continue;

      const fullPath = path.join(dir, file);
      const stat = fs.statSync(fullPath);

      if (stat.isDirectory()) {
        walk(fullPath, callback);
      } else {
        callback(fullPath);
      }
    }
  } catch (err) {
    // Ignore inaccessible directories
  }
}

function normalizeRoutePath(basePath, subPath) {
  let combined = subPath || "/";
  if (basePath) {
    const cleanBase = basePath.endsWith('/') ? basePath.slice(0, -1) : basePath;
    const cleanSub = combined.startsWith('/') ? combined : `/${combined}`;
    combined = `${cleanBase}${cleanSub}`;
  }
  if (!combined.startsWith('/')) {
    combined = `/${combined}`;
  }
  return combined;
}

function detectMethods(filePath) {
  const content = fs.readFileSync(filePath, "utf-8");
  const methods = new Set();
  
  // 1. Match standard and arrow functions: `export function GET`, `export const POST = ...`
  const regex = /export\s+(?:async\s+)?(?:function|const|let|var)\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/g;
  let match;
  
  while ((match = regex.exec(content)) !== null) {
    methods.add(match[1]);
  }

  // 2. Match grouped exports: `export { GET, POST }`
  const exportListRegex = /export\s+\{([^}]+)\}/g;
  while ((match = exportListRegex.exec(content)) !== null) {
    const exportedNames = match[1].split(',').map(s => s.trim());
    for (const name of exportedNames) {
      if (['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(name)) {
        methods.add(name);
      }
    }
  }

  // 3. Fallback for static strings
  if (methods.size === 0) {
    if (content.includes("export async function GET") || content.includes("export function GET")) methods.add("GET");
    if (content.includes("export async function POST") || content.includes("export function POST")) methods.add("POST");
    if (content.includes("export async function PUT") || content.includes("export function PUT")) methods.add("PUT");
    if (content.includes("export async function DELETE") || content.includes("export function DELETE")) methods.add("DELETE");
  }

  return Array.from(methods);
}

function scanNextApiRoutes(projectPath) {
  const routes = [];
  const appApiPath = path.join(projectPath, "app", "api");
  const pagesApiPath = path.join(projectPath, "pages", "api");

  // Scan Next.js App Router API Routes
  if (fs.existsSync(appApiPath)) {
    walk(appApiPath, (filePath) => {
      if (filePath.endsWith("route.js") || filePath.endsWith("route.ts")) {
        const route = filePath
          .replace(appApiPath, "")
          .replace(/\\/g, "/")
          .replace(/\/?route\.[jt]s$/, "");

        const methods = detectMethods(filePath);

        // If specific methods are found, add each as a separate route
        if (methods.length > 0) {
          for (const method of methods) {
            routes.push({
              path: `/api${route}`,
              method: method,
              file: filePath,
            });
          }
        } else {
          // If no methods are found, still add the route with an UNKNOWN method
          routes.push({
            path: `/api${route}`,
            method: "UNKNOWN",
            file: filePath,
          });
        }
      }
    });
  }

  // Scan Next.js Pages API Routes
  if (fs.existsSync(pagesApiPath)) {
    walk(pagesApiPath, (filePath) => {
      if (filePath.endsWith(".js") || filePath.endsWith(".ts")) {
        const route = filePath
          .replace(pagesApiPath, "")
          .replace(/\\/g, "/")
          .replace(/\.[jt]s$/, "");

        routes.push({
          path: `/api${route}`,
          method: "ANY", // Pages routes can handle any method natively
          file: filePath,
        });
      }
    });
  }

  return routes;
}

function scanExpressRoutes(projectPath) {
  const routes = [];

  walk(projectPath, (filePath) => {
    if (!filePath.endsWith(".js") && !filePath.endsWith(".ts")) return;

    const content = fs.readFileSync(filePath, "utf-8");

    // Match app.get(), router.post(), app.all()
    const regex = /(?:app|router)\.(get|post|put|delete|patch|all)\(["'`](.*?)["'`]/g;

    let match;
    while ((match = regex.exec(content)) !== null) {
      routes.push({
        path: match[2],
        method: match[1].toUpperCase(),
        file: filePath,
      });
    }
    
    // Match chained app.route('/path').get(...).post(...)
    const routeRegex = /(?:app|router)\.route\(["'`](.*?)["'`]\)([\s\S]*?)(?=;|(?:app|router))/g;
    let routeMatch;
    while ((routeMatch = routeRegex.exec(content)) !== null) {
      const pathStr = routeMatch[1];
      const chainedMethodsBlock = routeMatch[2];
      
      const methodRegex = /\.(get|post|put|delete|patch|all)\(/g;
      let methodMatch;
      while ((methodMatch = methodRegex.exec(chainedMethodsBlock)) !== null) {
        routes.push({
          path: pathStr,
          method: methodMatch[1].toUpperCase(),
          file: filePath,
        });
      }
    }
  });

  return routes;
}

export function scanFastApiFile(filePath) {
  const routes = [];
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return routes;
  }

  // 1. Detect APIRouter prefixes defined in this file
  const routerPrefixes = new Map();
  const routerPrefixRegex = /([a-zA-Z0-9_]+)\s*=\s*APIRouter\s*\([^)]*prefix\s*=\s*["']([^"']+)["']/g;
  let prefixMatch;
  while ((prefixMatch = routerPrefixRegex.exec(content)) !== null) {
    routerPrefixes.set(prefixMatch[1], prefixMatch[2]);
  }

  // 2. Direct HTTP method decorators:
  // e.g. @app.get("/items"), @router.post('/login'), @api.delete("/users/{id}")
  const methodRegex = /@([a-zA-Z0-9_]+)\.(get|post|put|delete|patch|options|head)\s*\(\s*["']([^"']+)["']/gi;
  let match;
  while ((match = methodRegex.exec(content)) !== null) {
    const routerVar = match[1];
    const httpMethod = match[2].toUpperCase();
    const rawPath = match[3];
    const prefix = routerPrefixes.get(routerVar) || "";
    const finalPath = normalizeRoutePath(prefix, rawPath);

    routes.push({
      path: finalPath,
      method: httpMethod,
      file: filePath,
    });
  }

  // 3. @app.api_route or @router.api_route with methods list
  const apiRouteRegex = /@([a-zA-Z0-9_]+)\.api_route\s*\(\s*["']([^"']+)["'](?:\s*,\s*[^)]*methods\s*=\s*\[([^\]]+)\])?/gi;
  let apiMatch;
  while ((apiMatch = apiRouteRegex.exec(content)) !== null) {
    const routerVar = apiMatch[1];
    const rawPath = apiMatch[2];
    const prefix = routerPrefixes.get(routerVar) || "";
    const finalPath = normalizeRoutePath(prefix, rawPath);
    const methodsListStr = apiMatch[3];

    if (methodsListStr) {
      const extractedMethods = methodsListStr
        .split(',')
        .map(m => m.replace(/["'\s]/g, '').toUpperCase())
        .filter(m => ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(m));

      for (const m of extractedMethods) {
        routes.push({
          path: finalPath,
          method: m,
          file: filePath,
        });
      }
    } else {
      routes.push({
        path: finalPath,
        method: "GET",
        file: filePath,
      });
    }
  }

  return routes;
}

export function scanFlaskFile(filePath) {
  const routes = [];
  let content = "";
  try {
    content = fs.readFileSync(filePath, "utf-8");
  } catch (err) {
    return routes;
  }

  // 1. Detect Blueprint url_prefixes defined in this file
  const bpPrefixes = new Map();
  const bpPrefixRegex = /([a-zA-Z0-9_]+)\s*=\s*Blueprint\s*\([^)]*url_prefix\s*=\s*["']([^"']+)["']/g;
  let bpMatch;
  while ((bpMatch = bpPrefixRegex.exec(content)) !== null) {
    bpPrefixes.set(bpMatch[1], bpMatch[2]);
  }

  // 2. Standard @app.route('/path', methods=['GET', 'POST']) or @bp.route('/path')
  const routeRegex = /@([a-zA-Z0-9_]+)\.route\s*\(\s*["']([^"']+)["'](?:\s*,\s*[^)]*methods\s*=\s*\[([^\]]+)\])?/gi;
  let match;
  while ((match = routeRegex.exec(content)) !== null) {
    const bpVar = match[1];
    const rawPath = match[2];
    const prefix = bpPrefixes.get(bpVar) || "";
    const finalPath = normalizeRoutePath(prefix, rawPath);
    const methodsListStr = match[3];

    if (methodsListStr) {
      const extractedMethods = methodsListStr
        .split(',')
        .map(m => m.replace(/["'\s]/g, '').toUpperCase())
        .filter(m => ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'].includes(m));

      for (const m of extractedMethods) {
        routes.push({
          path: finalPath,
          method: m,
          file: filePath,
        });
      }
    } else {
      // Flask defaults to GET if methods is omitted
      routes.push({
        path: finalPath,
        method: "GET",
        file: filePath,
      });
    }
  }

  // 3. Flask 2.0+ shortcut decorators: @app.get('/path'), @bp.post('/path')
  const shortcutRegex = /@([a-zA-Z0-9_]+)\.(get|post|put|delete|patch)\s*\(\s*["']([^"']+)["']/gi;
  let scMatch;
  while ((scMatch = shortcutRegex.exec(content)) !== null) {
    const bpVar = scMatch[1];
    const httpMethod = scMatch[2].toUpperCase();
    const rawPath = scMatch[3];
    const prefix = bpPrefixes.get(bpVar) || "";
    const finalPath = normalizeRoutePath(prefix, rawPath);

    routes.push({
      path: finalPath,
      method: httpMethod,
      file: filePath,
    });
  }

  return routes;
}

function scanFastApiRoutes(projectPath) {
  const routes = [];
  walk(projectPath, (filePath) => {
    if (!filePath.endsWith(".py")) return;
    routes.push(...scanFastApiFile(filePath));
  });
  return routes;
}

function scanFlaskRoutes(projectPath) {
  const routes = [];
  walk(projectPath, (filePath) => {
    if (!filePath.endsWith(".py")) return;
    routes.push(...scanFlaskFile(filePath));
  });
  return routes;
}

export function scanApiRoutes(projectPath, type) {
  if (type === "nextjs") {
    return scanNextApiRoutes(projectPath);
  }

  if (type === "express") {
    return scanExpressRoutes(projectPath);
  }

  if (type === "fastapi") {
    return scanFastApiRoutes(projectPath);
  }

  if (type === "flask") {
    return scanFlaskRoutes(projectPath);
  }

  return [];
}

export function scanSpecificFiles(projectPath, files, type) {
  const routes = [];
  
  for (const file of files) {
    const filePath = path.isAbsolute(file) ? file : path.join(projectPath, file);
    if (!fs.existsSync(filePath)) continue;

    if (type === "nextjs") {
      // Next.js App Router
      if (filePath.includes("app/api") && (filePath.endsWith("route.js") || filePath.endsWith("route.ts"))) {
        const routeStr = filePath.split("app/api")[1].replace(/\\/g, "/").replace(/\/?route\.[jt]s$/, "");
        const methods = detectMethods(filePath);
        if (methods.length > 0) {
          for (const method of methods) routes.push({ path: `/api${routeStr}`, method: method, file: filePath });
        } else {
          routes.push({ path: `/api${routeStr}`, method: "UNKNOWN", file: filePath });
        }
      }
      // Next.js Pages Router
      else if (filePath.includes("pages/api") && (filePath.endsWith(".js") || filePath.endsWith(".ts"))) {
        const routeStr = filePath.split("pages/api")[1].replace(/\\/g, "/").replace(/\.[jt]s$/, "");
        routes.push({ path: `/api${routeStr}`, method: "ANY", file: filePath });
      }
    } 
    
    else if (type === "express") {
      const content = fs.readFileSync(filePath, "utf-8");
      const regex = /(?:app|router)\.(get|post|put|delete|patch|all)\(["'`](.*?)["'`]/g;
      let match;
      while ((match = regex.exec(content)) !== null) {
        routes.push({ path: match[2], method: match[1].toUpperCase(), file: filePath });
      }
      const routeRegex = /(?:app|router)\.route\(["'`](.*?)["'`]\)([\s\S]*?)(?=;|(?:app|router))/g;
      let routeMatch;
      while ((routeMatch = routeRegex.exec(content)) !== null) {
        const pathStr = routeMatch[1];
        const methodRegex = /\.(get|post|put|delete|patch|all)\(/g;
        let methodMatch;
        while ((methodMatch = methodRegex.exec(routeMatch[2])) !== null) {
          routes.push({ path: pathStr, method: methodMatch[1].toUpperCase(), file: filePath });
        }
      }
    }

    else if (type === "fastapi") {
      routes.push(...scanFastApiFile(filePath));
    }

    else if (type === "flask") {
      routes.push(...scanFlaskFile(filePath));
    }
  }

  return routes;
}