import fs from 'fs';
import path from "path";

export function detectProjectType(projectPath) {
    try {
    const packageJsonPath = path.join(projectPath, "package.json");

    if (!fs.existsSync(packageJsonPath)) {
      return "other";
    }

    const packageJson = JSON.parse(
      fs.readFileSync(packageJsonPath, "utf-8")
    );

    const deps = {
      ...packageJson.dependencies,
      ...packageJson.devDependencies,
    };

    if (deps.next) {
      return "nextjs";
    }
    if (deps.express) {
      return "express";
    }

    return "other";
  } catch (err) {
    console.error("Error detecting project:", err);
    return "other";
  }
}
