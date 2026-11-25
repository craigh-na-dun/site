import { readFileSync } from "node:fs";

// GnuPG accepts data after an armored packet. Restrict the complete public
// signature to one armor block with canonical base64 before invoking GnuPG.
export function checkArmor([path]: string[]): Promise<number> {
  const data = readFileSync(String(path), "latin1");
  const match = /^-----BEGIN PGP SIGNATURE-----\n\n((?:[A-Za-z0-9+/=]+\n)+?)(?:=[A-Za-z0-9+/]{4}\n)?-----END PGP SIGNATURE-----\n?(?![\s\S])/.exec(data);
  if (!match) throw new Error("Unexpected detached signature armor");
  const payload = String(match[1]).replaceAll("\n", "");
  if (Buffer.from(payload, "base64").toString("base64") !== payload) throw new Error("Invalid base64 signature");
  return Promise.resolve(0);
}
