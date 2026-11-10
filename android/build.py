"""Offline Android SDK build, using the canonical shared frontend allowlist.

No Gradle/Maven downloads. Signing key lives outside source/releases; its random
password is protected with Windows DPAPI for this Windows user, never printed.
"""
import argparse, ctypes, hashlib, json, os, secrets, shutil, subprocess, sys, zipfile
from ctypes import wintypes
from datetime import datetime, timezone
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent

def run(args, **kwargs):
    result = subprocess.run([str(x) for x in args], check=True, capture_output=True, text=True, **kwargs)
    if result.stdout.strip(): print(result.stdout.strip())
    if result.stderr.strip(): print(result.stderr.strip())
    return result

class Blob(ctypes.Structure):
    _fields_ = [('size', wintypes.DWORD), ('data', ctypes.POINTER(ctypes.c_byte))]

def protect(data, decrypt=False):
    buffer = ctypes.create_string_buffer(data)
    source = Blob(len(data), ctypes.cast(buffer, ctypes.POINTER(ctypes.c_byte)))
    output = Blob()
    crypt = ctypes.windll.crypt32
    ok = crypt.CryptUnprotectData(ctypes.byref(source), None, None, None, None, 0, ctypes.byref(output)) if decrypt else crypt.CryptProtectData(ctypes.byref(source), 'NTK Android signing', None, None, None, 0, ctypes.byref(output))
    if not ok: raise ctypes.WinError()
    try: return ctypes.string_at(output.data, output.size)
    finally: ctypes.windll.kernel32.LocalFree(output.data)

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--debug', action='store_true');args=parser.parse_args()
    sdk=Path(os.environ.get('ANDROID_SDK_ROOT', str(Path(os.environ['LOCALAPPDATA'])/'Android'/'Sdk')))
    java=Path(os.environ.get('JAVA_HOME', r'C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot'))/'bin'
    tools=sdk/'build-tools'/'36.1.0'; platform=sdk/'platforms'/'android-36.1'/'android.jar'
    for required in [tools/'aapt2.exe',tools/'d8.bat',tools/'apksigner.bat',platform,java/'javac.exe']:
        if not required.is_file(): raise SystemExit(f'Required installed tool missing: {required}')
    stamp=datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    mode='debug' if args.debug else 'release';build=HERE/'build'/f'{mode}-{stamp}';build.mkdir(parents=True)
    assets=build/'assets'/'www';assets.mkdir(parents=True)
    manifest=json.loads((ROOT/'desktop'/'assets-manifest.json').read_text(encoding='utf-8-sig'))
    included=[]
    for item in manifest:
        rel=item['path'];source=ROOT/'working'/rel
        if Path(rel).is_absolute() or '..' in Path(rel).parts or not source.is_file():raise SystemExit(f'Unsafe or missing asset: {rel}')
        target=assets/rel;target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source,target)
        included.append({'path':rel,'sha256':hashlib.sha256(source.read_bytes()).hexdigest()})
    shutil.copytree(HERE/'web',assets/'native')
    html=(assets/'index.html').read_text(encoding='utf-8')
    # Native bundle needs no Google Font network request on first launch.
    html='\n'.join(line for line in html.splitlines() if 'fonts.googleapis.com' not in line and 'fonts.gstatic.com' not in line)
    html=html.replace('<head>','<head>\n  <script src="native/android.js"></script>',1).replace('</head>','  <link rel="stylesheet" href="native/android.css" />\n</head>',1)
    (assets/'index.html').write_text(html,encoding='utf-8')
    manifest_text=(HERE/'AndroidManifest.xml').read_text(encoding='utf-8')
    if args.debug:manifest_text=manifest_text.replace('<application ','<application android:debuggable="true" ',1)
    app_manifest=build/'AndroidManifest.xml';app_manifest.write_text(manifest_text,encoding='utf-8')
    compiled=build/'resources.zip';run([tools/'aapt2.exe','compile','--dir',HERE/'res','-o',compiled])
    unsigned=build/'unsigned.apk'
    run([tools/'aapt2.exe','link','-o',unsigned,'--manifest',app_manifest,'-I',platform,'-A',build/'assets','--min-sdk-version','29','--target-sdk-version','36','--auto-add-overlay',compiled])
    classes=build/'classes';classes.mkdir();sources=list((HERE/'src').rglob('*.java'))
    run([java/'javac.exe','-encoding','UTF-8','--release','8','-classpath',platform,'-d',classes,*sources])
    jar=build/'classes.jar';run([java/'jar.exe','--create','--file',jar,'-C',classes,'.'])
    dex=build/'dex';dex.mkdir();env=os.environ.copy();env['JAVA_HOME']=str(java.parent)
    run([tools/'d8.bat','--release','--min-api','29','--lib',platform,'--output',dex,jar],env=env)
    with zipfile.ZipFile(unsigned,'a',zipfile.ZIP_DEFLATED) as z:
        for f in dex.glob('*.dex'):z.write(f,f.name)
    aligned=build/'aligned.apk';run([tools/'zipalign.exe','-P','16','-f','4',unsigned,aligned])
    keydir=Path(os.environ['LOCALAPPDATA'])/'NTKOmniStreamStudio'/'android-signing';keydir.mkdir(parents=True,exist_ok=True)
    key=keydir/'omnistream-release.p12';pwfile=keydir/'password.dpapi'
    if key.exists()!=pwfile.exists():raise SystemExit('Signing state incomplete. Preserve existing key files; restore the matching key/password pair.')
    if not key.exists():
        password=secrets.token_urlsafe(40);pwfile.write_bytes(protect(password.encode()))
        env['NTK_ANDROID_STOREPASS']=password
        run([java/'keytool.exe','-genkeypair','-keystore',key,'-storetype','PKCS12','-storepass:env','NTK_ANDROID_STOREPASS','-keypass:env','NTK_ANDROID_STOREPASS','-alias','omnistream','-keyalg','RSA','-keysize','3072','-validity','10000','-dname','CN=NTK Hub OmniStream Studio, O=NTK Hub, C=NG'],env=env)
    else:env['NTK_ANDROID_STOREPASS']=protect(pwfile.read_bytes(),True).decode()
    output=build/f'OmniStreamStudio-2026.11.3.1-android.2-{mode}.apk'
    run([tools/'apksigner.bat','sign','--ks',key,'--ks-key-alias','omnistream','--ks-pass','env:NTK_ANDROID_STOREPASS','--key-pass','env:NTK_ANDROID_STOREPASS','--out',output,aligned],env=env)
    env.pop('NTK_ANDROID_STOREPASS',None)
    verification=run([tools/'apksigner.bat','verify','--verbose','--print-certs',output],env=env).stdout
    run([tools/'zipalign.exe','-c','-P','16','-v','4',output])
    result={'version':'2026.11.3.1-android.2','mode':mode,'apk':str(output),'sha256':hashlib.sha256(output.read_bytes()).hexdigest(),'bytes':output.stat().st_size,'minSdk':29,'targetSdk':36,'assets':included,'signingVerification':verification,'buildHost':'Windows; installed Android SDK36.1.0/platform36.1; JDK21'}
    (build/'manifest.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    (HERE/'build'/f'latest-{mode}.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    print(f'APK ready: {output}')

if __name__=='__main__':main()
