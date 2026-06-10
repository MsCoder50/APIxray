import fs from "fs";

function extractMethodBlock(content, method, type) {
  let startIndex = -1;
  let endIndex = content.length;

  if (type === "nextjs") {
    // Look for `export function GET`, `export const GET`, etc.
    const regex = new RegExp(`export\\s+(?:async\\s+)?(?:function|const|let|var)\\s+${method}\\b`, "i");
    const match = regex.exec(content);
    if (match) {
      startIndex = match.index;
      
      // Try to find the next export to use as a rough endpoint
      const nextExportRegex = /export\s+(?:async\s+)?(?:function|const|let|var)\s+(GET|POST|PUT|DELETE|PATCH|OPTIONS|HEAD)\b/g;
      nextExportRegex.lastIndex = startIndex + match[0].length;
      const nextMatch = nextExportRegex.exec(content);
      if (nextMatch) {
        endIndex = nextMatch.index;
      }
    }
  } else if (type === "express") {
    // Look for `.get(`, `.post(`, etc.
    const regex = new RegExp(`\\.${method.toLowerCase()}\\s*\\(`, "i");
    const match = regex.exec(content);
    if (match) {
      startIndex = match.index;
      
      // Try to find the next `.method(` to use as an endpoint
      const nextMethodRegex = /\.(get|post|put|delete|patch|all)\s*\(/ig;
      nextMethodRegex.lastIndex = startIndex + match[0].length;
      const nextMatch = nextMethodRegex.exec(content);
      if (nextMatch) {
        endIndex = nextMatch.index;
      }
    }
  }

  if (startIndex !== -1) {
    return content.substring(startIndex, endIndex);
  }

  // Fallback: return whole content if block cannot be reliably found
  return content;
}

export function detectParameters(filePath, method, type) {
  if (!fs.existsSync(filePath)) {
    return { query: [], body: [], params: [] };
  }

  const content = fs.readFileSync(filePath, "utf-8");
  const block = extractMethodBlock(content, method, type);

  const queryParams = new Set();
  const bodyParams = new Set();
  const pathParams = new Set();

  const extractDestructured = (matchStr, targetSet) => {
    matchStr.split(',').forEach(p => {
      // Handle aliasing `id: userId` or defaults `limit = 10`
      const paramName = p.split(/[=:]/)[0].trim().replace(/[^a-zA-Z0-9_]/g, '');
      // Exclude empty, spread operators, or invalid
      if (paramName && !p.trim().startsWith('...')) {
        targetSet.add(paramName);
      }
    });
  };

  // --- QUERY PARAMETERS ---
  // 1. req.query.paramName
  const queryDotRegex = /(?:req|request)\.query\.([a-zA-Z0-9_]+)/g;
  let match;
  while ((match = queryDotRegex.exec(block)) !== null) queryParams.add(match[1]);

  // 2. const { param1, param2 } = req.query
  const queryDestructRegex = /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*(?:req|request)\.query/g;
  while ((match = queryDestructRegex.exec(block)) !== null) {
    extractDestructured(match[1], queryParams);
  }

  // 3. searchParams.get('paramName')
  const searchParamsRegex = /searchParams\.get\(['"`](.*?)['"`]\)/g;
  while ((match = searchParamsRegex.exec(block)) !== null) queryParams.add(match[1]);


  // --- BODY PARAMETERS ---
  // 1. req.body.paramName
  const bodyDotRegex = /(?:req|request)\.body\.([a-zA-Z0-9_]+)/g;
  while ((match = bodyDotRegex.exec(block)) !== null) bodyParams.add(match[1]);

  // 2. const { param1, param2 } = req.body
  const bodyDestructRegex = /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*(?:req|request)\.body/g;
  while ((match = bodyDestructRegex.exec(block)) !== null) {
    extractDestructured(match[1], bodyParams);
  }

  // 3. const { param1 } = await request.json()
  const jsonDestructRegex = /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*(?:await\s+)?(?:req|request)\.json\(\)/g;
  while ((match = jsonDestructRegex.exec(block)) !== null) {
    extractDestructured(match[1], bodyParams);
  }


  // --- PATH PARAMETERS ---
  // 1. req.params.paramName
  const paramsDotRegex = /(?:req|request)?\.?params\.([a-zA-Z0-9_]+)/g;
  while ((match = paramsDotRegex.exec(block)) !== null) pathParams.add(match[1]);

  // 2. const { param1 } = req.params (or just `params` in Next.js App Router)
  const paramsDestructRegex = /(?:const|let|var)\s+\{([^}]+)\}\s*=\s*(?:req\.|request\.)?params/g;
  while ((match = paramsDestructRegex.exec(block)) !== null) {
    extractDestructured(match[1], pathParams);
  }

  return {
    query: Array.from(queryParams),
    body: Array.from(bodyParams),
    params: Array.from(pathParams)
  };
}
