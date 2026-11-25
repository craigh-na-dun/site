// The entire public file namespace. An unlisted file cannot enter a signed export.
export interface PublicFile { path: string; mime: string; text: string }
export type PublicBundle = readonly PublicFile[];

export function publicPaths(): ReadonlyMap<string, string> {
  return new Map([
    [".well-known/security.txt", "text/plain"],
    ["index.html", "text/html"],
    ["style.css", "text/css"],
  ]);
}

export function buildPublicSite(content: PublicBundle): PublicBundle {
  const paths = publicPaths();
  const files = new Map<string, PublicFile>();
  let bytes = 0;
  for (const { path, mime, text } of content) {
    if (!paths.has(path) || paths.get(path) !== mime || files.has(path)) throw new Error("Unexpected public file");
    if (/TEST_ONLY|PRIVATE[_ -]KEY|AGE-SECRET-KEY[-]1|\b[a-z0-9_.-]+\/vpn\b|vpn:\/\/|vless:\/\/|github_pat_|gh[pousr]_/i.test(text)) {
      throw new Error("Private material in public output");
    }
    bytes += new TextEncoder().encode(text).length;
    if (bytes > 65536) throw new Error("Public bundle exceeds 64 KiB");
    files.set(path, { path, mime, text });
  }
  return Array.from(paths.keys(), path => {
    const file = files.get(path);
    if (!file) throw new Error("Incomplete public bundle");
    return file;
  });
}
