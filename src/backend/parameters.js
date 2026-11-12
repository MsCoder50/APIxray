import fs from "fs";

function splitFunctionArgs(argsStr) {
  const args = [];
  let depth = 0;
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < argsStr.length; i++) {
    const char = argsStr[i];

    if (inQuotes) {
      current += char;
      if (char === quoteChar && argsStr[i - 1] !== '\\') {
        inQuotes = false;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      inQuotes = true;
      quoteChar = char;
      current += char;
      continue;
    }

    if (char === '(' || char === '[' || char === '{') {
      depth++;
      current += char;
    } else if (char === ')' || char === ']' || char === '}') {
      depth--;
      current += char;
    } else if (char === ',' && depth === 0) {
      if (current.trim()) args.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }

  if (current.trim()) {
    args.push(current.trim());
  }

  return args;
}

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
  } else if (type === "fastapi" || type === "flask") {
    const lowerMethod = method.toLowerCase();
    const upperMethod = method.toUpperCase();

    // Regex to find route decorator matching method
    const pyRegex = new RegExp(
      `@(?:[a-zA-Z0-9_]+)\\.(?:${lowerMethod}|route|api_route)\\s*\\(`,
      "ig"
    );

    let match;
    let foundIndex = -1;
    while ((match = pyRegex.exec(content)) !== null) {
      const matchText = content.substring(match.index, Math.min(content.length, match.index + 200));
      if (match[0].includes(".route") || match[0].includes(".api_route")) {
        const hasMethodsParam = /methods\s*=\s*\[([^\]]+)\]/i.exec(matchText);
        if (hasMethodsParam) {
          if (hasMethodsParam[1].toUpperCase().includes(upperMethod)) {
            foundIndex = match.index;
            break;
          }
        } else if (upperMethod === "GET") {
          foundIndex = match.index;
          break;
        }
      } else {
        foundIndex = match.index;
        break;
      }
    }

    if (foundIndex !== -1) {
      startIndex = foundIndex;
      const nextDefRegex = /\n(?:@[a-zA-Z0-9_]+|def\s+|class\s+)/g;
      nextDefRegex.lastIndex = startIndex + 10;
      let nextMatch;
      while ((nextMatch = nextDefRegex.exec(content)) !== null) {
        const inBetween = content.substring(startIndex, nextMatch.index);
        if (/def\s+[a-zA-Z0-9_]+/.test(inBetween)) {
          endIndex = nextMatch.index;
          break;
        }
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

  // --- PYTHON FRAMEWORKS (FastAPI & Flask) ---
  if (type === "fastapi" || type === "flask") {
    // 1. PATH PARAMETERS FROM ROUTE DECORATORS
    // FastAPI: /items/{item_id}
    const fastApiPathRegex = /\{([a-zA-Z0-9_]+)\}/g;
    let pMatch;
    while ((pMatch = fastApiPathRegex.exec(block)) !== null) {
      pathParams.add(pMatch[1]);
    }

    // Flask: /users/<int:user_id> or /posts/<post_id> or <string:name>
    const flaskPathRegex = /<(?:[a-zA-Z0-9_]+:)?([a-zA-Z0-9_]+)>/g;
    while ((pMatch = flaskPathRegex.exec(block)) !== null) {
      pathParams.add(pMatch[1]);
    }

    // 2. FLASK REQUEST ARGS & FORM/JSON
    // Query: request.args.get('param'), request.args['param'], request.values.get('param')
    const flaskQueryRegex = /request\.(?:args|values)(?:\.get(?:list)?\(['"`]([a-zA-Z0-9_]+)['"`]\)|\[['"`]([a-zA-Z0-9_]+)['"`]\])/g;
    let fMatch;
    while ((fMatch = flaskQueryRegex.exec(block)) !== null) {
      queryParams.add(fMatch[1] || fMatch[2]);
    }

    // Body: request.json.get('param'), request.form.get('param'), request.get_json()['param']
    const flaskBodyRegex = /(?:request\.(?:json|form)|data|payload|body|json_data)(?:\.get\(['"`]([a-zA-Z0-9_]+)['"`]\)|\[['"`]([a-zA-Z0-9_]+)['"`]\])/g;
    while ((fMatch = flaskBodyRegex.exec(block)) !== null) {
      bodyParams.add(fMatch[1] || fMatch[2]);
    }

    // 3. FASTAPI FUNCTION SIGNATURE & PYDANTIC MODELS
    const funcSigMatch = /(?:async\s+)?def\s+[a-zA-Z0-9_]+\s*\(([\s\S]*?)\)\s*(?:->[^:]+)?:/m.exec(block);
    if (funcSigMatch) {
      const argsStr = funcSigMatch[1];
      const args = splitFunctionArgs(argsStr);

      const ignoredFastApiArgs = new Set([
        'request', 'response', 'db', 'session', 'current_user',
        'background_tasks', 'settings', 'authorize', 'token', 'self', 'cls'
      ]);

      const pydanticModelsToCheck = new Set();

      for (const arg of args) {
        const parts = arg.split(':');
        const namePart = parts[0].trim();
        const typeAndDefault = parts[1] || "";

        const paramName = namePart.split(/[=\s]/)[0].trim();
        if (!paramName || ignoredFastApiArgs.has(paramName.toLowerCase())) continue;

        // If it's already detected as a path parameter, skip
        if (pathParams.has(paramName)) continue;

        // Check if Body(...) is explicitly specified
        if (/Body\s*\(/.test(typeAndDefault)) {
          bodyParams.add(paramName);
          continue;
        }

        // Check if Query(...) is explicitly specified
        if (/Query\s*\(/.test(typeAndDefault)) {
          queryParams.add(paramName);
          continue;
        }

        // Check if type looks like a Pydantic Model (PascalCase)
        const typeMatch = typeAndDefault.match(/^\s*([A-Z][a-zA-Z0-9_]+)/);
        if (typeMatch) {
          const typeName = typeMatch[1];
          const standardTypes = new Set(['Optional', 'Union', 'List', 'Dict', 'Set', 'Tuple', 'Any', 'Request', 'Response']);
          if (!standardTypes.has(typeName)) {
            pydanticModelsToCheck.add(typeName);
            continue;
          }
        }

        // By default in FastAPI, scalar parameters not in path are query parameters
        queryParams.add(paramName);
      }

      // If any Pydantic models were used, extract their attributes from the file
      for (const modelName of pydanticModelsToCheck) {
        const modelRegex = new RegExp(`class\\s+${modelName}\\s*\\([^)]*\\):([\\s\\S]*?)(?=\\n(?:class\\s+|def\\s+|@|$))`, 'g');
        const modelMatch = modelRegex.exec(content);
        if (modelMatch) {
          const classBody = modelMatch[1];
          const fieldRegex = /^\s+([a-zA-Z0-9_]+)\s*:/gm;
          let fieldMatch;
          let foundAny = false;
          while ((fieldMatch = fieldRegex.exec(classBody)) !== null) {
            const fieldName = fieldMatch[1];
            if (!fieldName.startsWith('_') && fieldName !== 'Config') {
              bodyParams.add(fieldName);
              foundAny = true;
            }
          }
          if (!foundAny) {
            bodyParams.add(modelName.toLowerCase());
          }
        } else {
          bodyParams.add(modelName.toLowerCase());
        }
      }
    }

    // 4. FastAPI query_params in code
    const pyQueryRegex = /(?:request|req)\.query_params(?:\.get\(['"`]([a-zA-Z0-9_]+)['"`]\)|\[['"`]([a-zA-Z0-9_]+)['"`]\])/g;
    while ((fMatch = pyQueryRegex.exec(block)) !== null) {
      queryParams.add(fMatch[1] || fMatch[2]);
    }
  }

  return {
    query: Array.from(queryParams),
    body: Array.from(bodyParams),
    params: Array.from(pathParams)
  };
}
