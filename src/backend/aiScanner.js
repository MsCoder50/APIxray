import fs from 'fs';
import path from 'path';
import { GoogleGenAI } from '@google/genai';

// Get Flat File Paths
function getFilePaths(dir, basePath, currentDepth = 0, maxDepth = 4) {
  if (currentDepth > maxDepth) return [];
  const ignored = new Set(['node_modules', '.git', 'dist', 'build', 'out', '.vite', '.next', 'public', 'assets', 'components', 'styles', 'hooks', 'test', 'tests', 'docs']);
  let paths = [];
  
  try {
    const items = fs.readdirSync(dir);
    for (const item of items) {
      if (ignored.has(item) || item.startsWith('.')) continue;
      
      const fullPath = path.join(dir, item);
      const stat = fs.statSync(fullPath);
      
      if (stat.isDirectory()) {
        paths = paths.concat(getFilePaths(fullPath, basePath, currentDepth + 1, maxDepth));
      } else {
        if (item.endsWith('.js') || item.endsWith('.ts')) {
          paths.push(path.relative(basePath, fullPath));
        }
      }
    }
  } catch (err) {
    console.error(`Error reading directory ${dir}:`, err);
  }
  return paths;
}

// Scan Structure
export async function aiScanStructure(projectPath, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  
  const files = getFilePaths(projectPath, projectPath);
  const filesList = files.join('\n');

  const prompt = `
You are an expert API backend developer. 
Analyze the following list of files and identify the ones that most likely contain backend API routes/endpoints (e.g., Express routers, Next.js app/api or pages/api).
Return ONLY a strictly formatted JSON array of file paths. Do not include markdown formatting.
Example: ["src/routes/users.js", "app/api/auth/route.ts"]

Project Files:
${filesList}
`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    let text = response.text.trim();
    if (text.startsWith('\`\`\`json')) {
      text = text.substring(7, text.length - 3).trim();
    } else if (text.startsWith('\`\`\`')) {
      text = text.substring(3, text.length - 3).trim();
    }
    
    return JSON.parse(text);
  } catch (error) {
    console.error('AI Structure Scan Error:', error);
    throw new Error('Failed to analyze project structure: ' + error.message);
  }
}



// Resolve Local Imports
function getLocalImportsContext(filePath, code) {
  const dir = path.dirname(filePath);
  let context = "";
  
  const importRegex = /(?:require\(['"](\.[^'"]+)['"]\))|(?:from\s+['"](\.[^'"]+)['"])/g;
  let match;
  const processed = new Set();
  
  while ((match = importRegex.exec(code)) !== null) {
    let importPath = match[1] || match[2];
    if (!importPath) continue;
    
    if (processed.has(importPath)) continue;
    processed.add(importPath);

    let targetFile = path.resolve(dir, importPath);
    if (!fs.existsSync(targetFile)) {
      if (fs.existsSync(targetFile + '.js')) targetFile += '.js';
      else if (fs.existsSync(targetFile + '.ts')) targetFile += '.ts';
      else continue;
    }
    
    try {
      const importedCode = fs.readFileSync(targetFile, 'utf-8');
      context += `\n--- Imported File: ${importPath} ---\n${importedCode}\n`;
    } catch (e) {
      console.error('Failed to read imported file', targetFile);
    }
  }
  return context;
}

// Detect Parameters
export async function aiDetectParams(projectPath, routePath, method, filePath, apiKey) {
  const ai = new GoogleGenAI({ apiKey });
  
  if (!fs.existsSync(filePath)) {
    throw new Error('File not found');
  }

  const code = fs.readFileSync(filePath, 'utf-8');
  const importsContext = getLocalImportsContext(filePath, code);

  const prompt = `
You are an expert API developer. Analyze the following API endpoint code and its imported dependencies.
Extract the required HTTP request parameters (query parameters, body fields, and path variables).

Endpoint Path: ${routePath}
Endpoint Method: ${method}

Return ONLY a strictly formatted JSON object with the schema:
{
  "query": ["param1", "param2"],
  "body": ["field1", "field2"],
  "params": ["pathVar1"]
}
Do not include markdown formatting or backticks. If none found, return empty arrays.

--- Route File Code ---
${code}

${importsContext}
`;

  try {
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
    });
    
    let text = response.text.trim();
    if (text.startsWith('\`\`\`json')) {
      text = text.substring(7, text.length - 3).trim();
    } else if (text.startsWith('\`\`\`')) {
      text = text.substring(3, text.length - 3).trim();
    }
    
    const parsed = JSON.parse(text);
    return {
      query: parsed.query || [],
      body: parsed.body || [],
      params: parsed.params || []
    };
  } catch (error) {
    console.error('AI Detect Params Error:', error);
    throw new Error('Detect Params Error: ' + error.message);
  }
}
