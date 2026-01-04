// utils/ensureCacheFile.ts
import fs from "fs/promises";
import path from "path";

export async function ensureCacheFile(filePath: string) {
  const dir = path.dirname(filePath);

  try {
    await fs.mkdir(dir, { recursive: true });
  } catch {}

  try {
    await fs.access(filePath);
  } catch {
    await fs.writeFile(filePath, "{}", "utf-8");
  }
}
