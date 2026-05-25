import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const promptsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "prompts");

const cache = new Map<string, string>();

export const loadPrompt = (name: string): string => {
  if (cache.has(name)) return cache.get(name)!;
  const content = fs.readFileSync(path.join(promptsDir, `${name}.md`), "utf8");
  cache.set(name, content);
  return content;
};
