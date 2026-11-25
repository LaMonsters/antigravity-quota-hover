"""Build the offline Windows release from the official, pinned Node.js zip.

python scripts/package.py path/to/node-v22.23.5-win-x64.zip path/to/output.zip
"""
from pathlib import Path
import hashlib
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]
NODE = "node-v22.23.5-win-x64"
NODE_SHA256 = "4a191082e9706866830379d577d2cc8a50c776fcd9436a8d061b063ed0d9a0e3"
PREFIX = "Antigravity-ZH-Quota/"


def build(runtime, output):
    if hashlib.sha256(runtime.read_bytes()).hexdigest() != NODE_SHA256:
        raise ValueError("Node.js ZIP does not match the pinned official SHA-256")
    files = ["README.md", "LICENSE", "bundle.js", "install.bat", "uninstall.bat",
             "launcher.cmd", "src/sidebar-usage-widget.js", "localization/LICENSE"]
    for folder, pattern in [("dicts", "*.json"), ("src", "*.js")]:
        for file in sorted((ROOT / "localization" / folder).glob(pattern)):
            files.append(file.relative_to(ROOT).as_posix())
    with zipfile.ZipFile(runtime) as node, zipfile.ZipFile(output, "x", zipfile.ZIP_DEFLATED) as package:
        for name in files:
            package.write(ROOT / name, PREFIX + name)
        for name in ["node.exe", "LICENSE"]:
            package.writestr(PREFIX + "runtime/" + name, node.read(NODE + "/" + name))


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    build(*map(Path, sys.argv[1:]))
