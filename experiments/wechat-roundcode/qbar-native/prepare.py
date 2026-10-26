"""Fetch pinned experimental inputs into ignored artifacts; never executes them."""
from concurrent.futures import ThreadPoolExecutor
import hashlib
import json
from pathlib import Path
import urllib.request
import zipfile

LAB = Path(__file__).resolve().parent
MAVEN_URL = "https://repo.maven.apache.org/maven2/org/apache/maven/apache-maven/3.9.9/apache-maven-3.9.9-bin.zip"
MAVEN_SHA512 = "8beac8d11ef208f1e2a8df0682b9448a9a363d2ad13ca74af43705549e72e74c9378823bf689287801cbbfc2f6ea9596201d19ccacfdfb682ee8a2ff4c4418ba"


def fetch(item):
    path = (LAB / item["local_path"]).resolve()
    if not path.is_relative_to(LAB / "artifacts"):
        raise ValueError("Download path must be inside artifacts")
    algorithm = item.get("algorithm", "sha256")
    if path.exists():
        data = path.read_bytes()
    else:
        with urllib.request.urlopen(item["url"], timeout=45) as response:
            data = response.read()
    if len(data) != item["bytes"] or hashlib.new(algorithm, data).hexdigest() != item[algorithm]:
        raise ValueError("Input checksum mismatch: " + path.name)
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(data)
    return path


def main():
    manifest = json.loads((LAB / "vendor-manifest.json").read_text(encoding="utf-8"))
    with ThreadPoolExecutor(max_workers=4) as pool:
        paths = list(pool.map(fetch, manifest["files"]))
    archive = fetch({"local_path": "artifacts/tools/apache-maven-3.9.9-bin.zip",
                     "url": MAVEN_URL, "bytes": 9202456, "algorithm": "sha512", "sha512": MAVEN_SHA512})
    destination = (LAB / "artifacts/tools").resolve()
    with zipfile.ZipFile(archive) as source:
        if any(not (destination / name).resolve().is_relative_to(destination) for name in source.namelist()):
            raise ValueError("Invalid archive path")
        if not (destination / "apache-maven-3.9.9/bin/mvn.cmd").exists():
            source.extractall(destination)
    print(f"Verified {len(paths)} pinned inputs and Maven 3.9.9; nothing executed.")


if __name__ == "__main__":
    main()
