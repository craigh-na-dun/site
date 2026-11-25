import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, openSync, closeSync, constants, fstatSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inspectArchive } from "./site-archive.ts";
import { admitPublication, digest, verifyPublicManifest, type PublicManifest } from "../public-site/manifest.ts";

export function readBounded(path: string, limit: number): Buffer {
  const fd = openSync(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const info = fstatSync(fd);
    if (!info.isFile() || info.size > limit) throw new Error("Invalid publication input");
    return readFileSync(fd);
  } finally { closeSync(fd); }
}

export function ownerSignature(script: string, manifest: string, signature: string): boolean {
  const temp = mkdtempSync(join(tmpdir(), "public-signature-"));
  try {
    const file = join(temp, "manifest.asc");
    writeFileSync(file, signature, { mode: 0o600 });
    execFileSync("bash", [join(script, "owner-signature.sh"), "manifest", file], { input: manifest, timeout: 10000, stdio: "pipe" });
    return true;
  } catch { return false; }
  finally { rmSync(temp, { recursive: true, force: true }); }
}

export interface VerificationIO { script: string; verify: typeof ownerSignature }

export async function readCandidate(dir: string, io: VerificationIO) {
  const zip = readBounded(join(dir, "bundle.zip"), 67584);
  const bytes = readBounded(join(dir, "manifest.json"), 4096);
  const sig = readBounded(join(dir, "manifest.asc"), 4096);
  const bundle = inspectArchive(zip);
  const manifest = await verifyPublicManifest(bundle, bytes.toString(), sig.toString(), (m, s) => io.verify(io.script, m, s));
  const prior = readBounded(join(dir, "previous.json"), 4096);
  const last = { sequence: (JSON.parse(prior.toString()) as { sequence: number }).sequence, digest: await digest(prior.toString()) };
  let rollbackFiles = null;
  if (manifest.rollback !== null) {
    const history = JSON.parse(readBounded(join(dir, "rollback.json"), 4096).toString()) as PublicManifest;
    if (history.sequence !== manifest.rollback) throw new Error("Rollback receipt sequence mismatch");
    rollbackFiles = history.files;
  }
  admitPublication(manifest, last, rollbackFiles);
  return { zip, bytes, sig, bundle, manifest, last, rollbackFiles };
}

export async function verifyPublicDirectory(dir: string, io: VerificationIO = { script: "templates/public-repo", verify: ownerSignature }): Promise<number> {
  const { bytes, bundle } = await readCandidate(dir, io);
  const root = join(dir, "verified");
  mkdirSync(root);
  mkdirSync(join(root, ".well-known"));
  for (const file of bundle) writeFileSync(join(root, file.path), file.text);
  writeFileSync(join(root, "publication.json"), bytes);
  return 0;
}
