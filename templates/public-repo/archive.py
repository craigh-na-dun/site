"""Deterministic, stored ZIP with a closed namespace. Never extract archive paths."""
import io
import json
from pathlib import Path
import stat
import sys
import zipfile

FILES = {
    ".well-known/security.txt": ("content/security.txt", "text/plain"),
    "index.html": ("content/index.html", "text/html"),
    "style.css": ("assets/style.css", "text/css"),
}
LIMIT = 65536


def encode(files):
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as archive:
        for name, data in files.items():
            item = zipfile.ZipInfo(name, (1980, 1, 1, 0, 0, 0))
            item.create_system = 3
            item.external_attr = (stat.S_IFREG | 0o644) << 16
            archive.writestr(item, data)
    return buf.getvalue()


def sources(root):
    allowed = {source for source, _ in FILES.values()}
    expected = allowed | {"content", "assets"}
    if root.is_symlink() or not root.is_dir():
        raise ValueError("invalid source root")
    for path in root.rglob("*"):
        if path.is_symlink() or path.relative_to(root).as_posix() not in expected:
            raise ValueError("unexpected source entry")
    data = {}
    for name, (source, _) in FILES.items():
        path = root / source
        if not path.is_file() or path.stat().st_size > LIMIT:
            raise ValueError("invalid source file")
        data[name] = path.read_bytes()
    return data


def unpack(raw):
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        entries = archive.infolist()
        if [e.filename for e in entries] != list(FILES):
            raise ValueError("unexpected ZIP members")
        if any(e.compress_type != zipfile.ZIP_STORED for e in entries) or sum(e.file_size for e in entries) > LIMIT:
            raise ValueError("ZIP limits exceeded")
        files = {e.filename: archive.read(e) for e in entries}
    if encode(files) != raw:
        raise ValueError("noncanonical ZIP")
    return files


if __name__ == "__main__":
    mode, path = sys.argv[1:]
    if mode == "pack":
        files = sources(Path(path))
        if sum(map(len, files.values())) > LIMIT:
            raise ValueError("source limits exceeded")
        sys.stdout.buffer.write(encode(files))
    elif mode == "inspect":
        raw = sys.stdin.buffer.read(LIMIT + 2049)
        if len(raw) > LIMIT + 2048:
            raise ValueError("ZIP too large")
        files = unpack(raw)
        print(json.dumps([{"path": n, "text": b.decode("utf-8"), "mime": FILES[n][1]} for n, b in files.items()]))
    else:
        raise ValueError("unknown operation")
