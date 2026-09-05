import { randomBytes } from "crypto";

/** Unguessable URL token for public magic links. */
export function mintPublicToken(bytes = 24) {
  return randomBytes(bytes).toString("base64url");
}
