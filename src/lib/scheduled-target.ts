import { releaseIdentity } from "@/lib/release";

/**
 * An effectful scheduled sweep runs only on the deployment its caller named:
 * the caller sends the environment and approved release it expects, and this
 * deployment refuses unless it is that environment serving that commit.
 * Checked before any effect; there is no default.
 */
export function scheduledTargetRefusal(headers: Headers, env: NodeJS.ProcessEnv = process.env): string | null {
  const target = headers.get("x-orvius-target")?.trim();
  const release = headers.get("x-orvius-release")?.trim().toLowerCase();
  if (!target) return "x-orvius-target is required: name the environment this sweep is meant for";
  if (!release || !/^[0-9a-f]{40}$/.test(release)) return "x-orvius-release is required: the full approved release commit";
  const self = releaseIdentity(env);
  if (self.environment !== target) return `this deployment is ${self.environment}, not ${target}`;
  if (!self.commit || self.commit !== release) return `this deployment serves ${self.commit ?? "an unnamed build"}, not ${release}`;
  return null;
}
