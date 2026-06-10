import fs from "fs";
import path from "path";

function walk(dir, callback) {
  const files = fs.readdirSync(dir);

  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);

    if (stat.isDirectory()) {
      walk(fullPath, callback);
    } else {
      callback(fullPath);
    }
  }
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

export function scanApiRoutes(projectPath, type) {
  if (type === "nextjs") {
    return scanNextApiRoutes(projectPath);
  }

  if (type === "express") {
    return scanExpressRoutes(projectPath);
  }

  return [];
}