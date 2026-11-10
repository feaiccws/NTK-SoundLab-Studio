"""Package a prepared production Laravel stage without copying local runtime data.

Run Composer install --no-dev in an isolated stage first. This program never
reads .env or live databases, never mutates source, and preserves replaced ZIPs.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import tempfile
import uuid
import zipfile

ROOT_FILES = {'artisan', 'composer.json', 'composer.lock', '.env.example', '.htaccess'}
PUBLIC_ROOT = {'index.php', 'index.html', '404.html', 'sw.js', 'manifest.json', 'robots.txt', 'favicon.ico', '.htaccess'}
PUBLIC_DIRS = {'assets', 'css', 'js', 'lib', 'build'}
ASSET_EXTENSIONS = {'.php', '.html', '.json', '.js', '.mjs', '.css', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.wasm', '.txt'}
PRIVATE_EXTENSIONS = {'.sqlite', '.sqlite3', '.db', '.log', '.pem', '.key', '.pfx', '.p12', '.bak', '.sql'}
EXCLUDED_PARTS = {'.git', '.github', '.svn', 'node_modules', 'evidence', 'helper', 'tests', 'test', 'fixtures', 'examples', 'docs', '__pycache__', '.idea', '.vscode'}
VENDOR_EXCLUDED_PARTS = EXCLUDED_PARTS - {'helper', 'test'}
SKELETON_DIRS = ['bootstrap/cache/', 'storage/app/', 'storage/app/private/', 'storage/app/public/', 'storage/app/downloads/', 'storage/framework/cache/data/', 'storage/framework/sessions/', 'storage/framework/views/', 'storage/logs/']


def reject_link(file: Path) -> None:
    if file.is_symlink() or (hasattr(file, 'is_junction') and file.is_junction()):
        raise ValueError(f'Links/junctions are not allowed in production staging: {file.name}')


def regular_files(directory: Path):
    reject_link(directory)
    for folder, directories, names in os.walk(directory, followlinks=False):
        for name in directories:
            reject_link(Path(folder) / name)
        for name in names:
            file = Path(folder) / name
            reject_link(file)
            if file.is_file():
                yield file


def allowed(relative: Path) -> bool:
    parts = relative.parts
    lower = [part.lower() for part in parts]
    if relative.as_posix() in ROOT_FILES:
        return True
    if any(part in EXCLUDED_PARTS for part in lower) or relative.suffix.lower() in PRIVATE_EXTENSIONS:
        return False
    if any(part.startswith('.env') or part in {'auth.json', 'cookies.txt', 'cookies.json', 'credentials.json', 'desktop.log'} for part in lower):
        return False
    if parts[0] in {'app', 'config', 'routes'}:
        return relative.suffix == '.php'
    if parts[0] == 'bootstrap':
        return len(parts) == 2 and relative.suffix == '.php'
    if parts[0] == 'database':
        return len(parts) >= 3 and parts[1] == 'migrations' and relative.suffix == '.php'
    if parts[0] == 'resources':
        return len(parts) >= 3 and parts[1] in {'views', 'lang'} and relative.suffix in {'.php', '.html', '.json'}
    if parts[0] == 'lang':
        return relative.suffix in {'.php', '.json'}
    if parts[0] == 'public':
        return (len(parts) == 2 and parts[1] in PUBLIC_ROOT) or (len(parts) >= 3 and parts[1] in PUBLIC_DIRS and relative.suffix.lower() in ASSET_EXTENSIONS)
    return False


def verify_example(file: Path) -> None:
    # Validation emits setting names only; secret values are never logged.
    text = file.read_text(encoding='utf-8-sig')
    found_key = False
    for line in text.splitlines():
        match = re.match(r'\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*)$', line)
        if not match:
            continue
        name, value = match.groups()
        if name == 'APP_KEY':
            found_key = True
        if name == 'APP_KEY' or re.search(r'(?:^|_)(?:KEY|SECRET|PASSWORD|TOKEN|CREDENTIALS?)(?:_|$)', name):
            if value.strip().strip('"\'').lower() not in {'', 'null'}:
                raise ValueError(f'.env.example must not contain a populated secret setting: {name}')
    if not found_key:
        raise ValueError('.env.example must contain an empty APP_KEY setting.')


def production_vendor(source: Path) -> list[Path]:
    vendor = source / 'vendor'
    installed_file = vendor / 'composer' / 'installed.json'
    if not installed_file.is_file() or not (vendor / 'autoload.php').is_file():
        raise ValueError('Prepare production vendor dependencies with composer install --no-dev in the staging directory.')
    installed = json.loads(installed_file.read_text(encoding='utf-8-sig'))
    if not isinstance(installed, dict) or installed.get('dev', True) or installed.get('dev-package-names'):
        raise ValueError('The vendor stage includes development dependencies; run composer install --no-dev in the isolated stage.')
    files = [vendor / 'autoload.php']
    files.extend(regular_files(vendor / 'composer'))
    for package in installed.get('packages', []):
        install = package.get('install-path')
        if not install:
            raise ValueError('Composer install metadata is missing a package path.')
        directory = (vendor / 'composer' / install).resolve()
        if not directory.is_relative_to(vendor.resolve()) or directory == vendor.resolve():
            raise ValueError('A Composer package path escapes the production vendor directory.')
        if not directory.is_dir():
            raise ValueError(f'Production dependency missing: {package.get("name", "unknown")}')
        files.extend(regular_files(directory))
    return list(dict.fromkeys(files))


def package(source: Path, output: Path) -> dict:
    source = source.resolve(strict=True)
    output = output.resolve()
    if output.is_relative_to(source):
        raise ValueError('The output ZIP must be outside the source staging directory.')
    for required in ['artisan', 'composer.json', 'composer.lock', '.env.example', 'bootstrap/app.php', 'public/index.php', 'resources/views/welcome.blade.php']:
        if not (source / required).is_file():
            raise ValueError(f'Required production file missing: {required}')
    verify_example(source / '.env.example')
    entries = {}
    for name in ROOT_FILES:
        file = source / name
        if file.is_file():
            reject_link(file)
            entries[name] = file
    for name in ['app', 'bootstrap', 'config', 'database', 'public', 'resources', 'routes', 'lang']:
        directory = source / name
        if not directory.is_dir():
            continue
        for file in regular_files(directory):
            relative = file.relative_to(source)
            if allowed(relative):
                entries[relative.as_posix()] = file
    for file in production_vendor(source):
        relative = file.relative_to(source)
        lower = [part.lower() for part in relative.parts]
        if any(part in VENDOR_EXCLUDED_PARTS for part in lower) or relative.suffix.lower() in PRIVATE_EXTENSIONS:
            continue
        if any(part.startswith('.env') or part in {'auth.json', 'cookies.txt', 'credentials.json'} for part in lower):
            continue
        entries[relative.as_posix()] = file
    output.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix=output.stem + '-', suffix='.zip', dir=output.parent)
    os.close(descriptor)
    temporary = Path(temporary)
    manifest = []
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
            for relative, file in sorted(entries.items()):
                data = file.read_bytes()
                archive.writestr(relative, data)
                manifest.append({'path': relative, 'bytes': len(data), 'sha256': hashlib.sha256(data).hexdigest()})
            for directory in SKELETON_DIRS:
                archive.writestr(directory + '.gitignore', '*\n!.gitignore\n')
        with zipfile.ZipFile(temporary) as archive:
            if archive.testzip():
                raise ValueError('The generated archive failed its CRC verification.')
            names = archive.namelist()
            if '.env' in names or any(name.startswith('storage/') and not name.endswith('/.gitignore') for name in names):
                raise ValueError('Runtime data entered the generated archive.')
        backup = None
        if output.exists():
            backup_dir = output.parent / 'package-backups'
            backup_dir.mkdir(exist_ok=True)
            backup = backup_dir / f'{output.stem}-{datetime.now(timezone.utc):%Y%m%dT%H%M%SZ}-{uuid.uuid4().hex[:8]}{output.suffix}'
            shutil.copy2(output, backup)
        os.replace(temporary, output)
        report = {'file': output.name, 'bytes': output.stat().st_size, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'entries': len(manifest) + len(SKELETON_DIRS), 'source': str(source), 'rollback': str(backup) if backup else None, 'files': manifest}
        output.with_suffix('.manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
        return report
    except Exception:
        # Retain a failed staging ZIP for diagnosis; never delete source/runtime files.
        raise


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--source', type=Path, required=True, help='Prepared isolated Laravel stage with production-only vendor dependencies')
    parser.add_argument('--output', type=Path, required=True, help='Output ZIP outside the staging directory; an existing ZIP is backed up')
    args = parser.parse_args()
    result = package(args.source, args.output)
    print(json.dumps({key: value for key, value in result.items() if key != 'files'}, indent=2))


if __name__ == '__main__':
    main()
