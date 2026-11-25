import { crc32 } from "node:zlib";
import { buildPublicSite, publicPaths, type PublicBundle } from "../public-site/build.ts";

// The version-one format uses stored members, the DOS epoch and regular Unix
// files. These headers must reproduce archives signed before the TS migration.
export function encodeArchive(input: PublicBundle): Buffer {
  const files = buildPublicSite(input);
  const local: Buffer[] = [];
  const directory: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.path);
    const data = Buffer.from(file.text);
    const header = Buffer.alloc(30);
    header.writeUInt32LE(0x04034b50);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(33, 12);
    header.writeUInt32LE(crc32(data), 14);
    header.writeUInt32LE(data.length, 18);
    header.writeUInt32LE(data.length, 22);
    header.writeUInt16LE(name.length, 26);
    local.push(header, name, data);

    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50);
    entry.writeUInt16LE(0x0314, 4);
    header.copy(entry, 6, 4, 30);
    entry.writeUInt32LE(0o100644 * 65536, 38);
    entry.writeUInt32LE(offset, 42);
    directory.push(entry, name);
    offset += header.length + name.length + data.length;
  }
  const central = Buffer.concat(directory);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(central.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...local, central, end]);
}

export function inspectArchive(zip: Buffer): PublicBundle {
  if (zip.length > 67584) throw new Error("ZIP too large");
  let offset = 0;
  const files = Array.from(publicPaths(), ([path, mime]) => {
    // Read only the three expected payloads. Re-encoding validates every header,
    // filename, CRC, Unix mode, central-directory offset and the exact end.
    const length = zip.readUInt32LE(offset + 18);
    const start = offset + 30 + Buffer.byteLength(path);
    offset = start + length;
    return { path, mime, text: zip.toString("utf8", start, offset) };
  });
  if (!encodeArchive(files).equals(zip)) throw new Error("noncanonical ZIP");
  return files;
}
