import { buildPublicSite, type PublicBundle } from "./build.ts";

export interface PublicManifest {
  version: 1;
  repository: string;
  origin: string;
  sequence: number;
  previous: string;
  rollback: number | null;
  files: { path: string; mime: string; bytes: number; sha256: string }[];
}

export async function digest(text: string): Promise<string> {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash), byte => byte.toString(16).padStart(2, "0")).join("");
}

export async function makeManifest(bundle: PublicBundle, sequence: number, previous: string, rollback: number | null): Promise<string> {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999999999999999 || !/^[a-f0-9]{64}$/.test(previous)) throw new Error("Invalid publication basis");
  if (rollback !== null && (!Number.isSafeInteger(rollback) || rollback < 1 || rollback >= sequence)) throw new Error("Invalid rollback sequence");
  const files = await Promise.all(buildPublicSite(bundle).map(async ({ path, mime, text }) => ({
    path, mime, bytes: new TextEncoder().encode(text).length, sha256: await digest(text),
  })));
  const manifest: PublicManifest = { version: 1, repository: "craigh-na-dun/site", origin: "https://retrogamesphotogallery.pro", sequence, previous, rollback, files };
  return JSON.stringify(manifest) + "\n";
}

export async function verifyPublicManifest(bundle: PublicBundle, manifest: string, signature: string, verifyOwner: (text: string, signature: string) => boolean): Promise<PublicManifest> {
  if (!verifyOwner(manifest, signature)) throw new Error("Owner signature required");
  const parsed = JSON.parse(manifest) as PublicManifest;
  if (manifest !== await makeManifest(bundle, parsed.sequence, parsed.previous, parsed.rollback)) throw new Error("Public manifest mismatch");
  return parsed;
}

export interface PublicationReceipt { sequence: number; digest: string }

// Every candidate names the exact prior successful manifest, including the
// separately commissioned sequence-zero receipt. A rollback advances the tip.
export function admitPublication(manifest: PublicManifest, last: PublicationReceipt, rollbackFiles: PublicManifest["files"] | null): void {
  if (manifest.sequence !== last.sequence + 1 || manifest.previous !== last.digest) throw new Error("Reconcile previous deployment");
  if (manifest.rollback !== null && JSON.stringify(manifest.files) !== JSON.stringify(rollbackFiles)) throw new Error("Rollback content mismatch");
}
