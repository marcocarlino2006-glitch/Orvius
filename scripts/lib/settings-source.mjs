import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export function readSettingsSource(root = process.cwd()) {
  const dir = join(root, "src/components/settings-center");
  return readdirSync(dir, { recursive: true })
    .filter((file) => /\.tsx?$/.test(String(file)))
    .sort()
    .map((file) => readFileSync(join(dir, String(file)), "utf8"))
    .join("\n");
}
