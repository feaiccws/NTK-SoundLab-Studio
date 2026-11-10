#!/bin/sh
set -eu
# Run inside Linux. The Go binary must be built for linux/amd64 with CGO_ENABLED=0.
# Usage: package-linux.sh BINARY ICON APPIMAGETOOL RUNTIME OUTPUT_DIRECTORY
[ "$#" -eq 5 ] || { echo 'Expected binary, icon, appimagetool, runtime and output directory' >&2; exit 2; }
binary=$(realpath "$1")
icon=$(realpath "$2")
tool=$(realpath "$3")
runtime=$(realpath "$4")
mkdir -p "$5"
output=$(realpath "$5")
script_dir=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
version=2026.11.3.1
# Use Linux storage for permissions; Windows-mounted workspaces report mode 777.
stage=$(mktemp -d "${TMPDIR:-/tmp}/ntk-omnistream-package-XXXXXXXX")
appdir="$stage/OmniStreamStudio.AppDir"
debdir="$stage/debian"
mkdir -p "$appdir/usr/bin" "$appdir/usr/share/applications" "$appdir/usr/share/icons/hicolor/192x192/apps" "$appdir/usr/share/doc/omnistream-studio"
install -m 755 "$binary" "$appdir/usr/bin/omnistream-studio"
install -m 644 "$icon" "$appdir/omnistream-studio.png"
install -m 644 "$icon" "$appdir/usr/share/icons/hicolor/192x192/apps/omnistream-studio.png"
install -m 644 "$script_dir/README-LINUX.md" "$appdir/usr/share/doc/omnistream-studio/README.md"
cat > "$appdir/omnistream-studio.desktop" <<'DESKTOP'
[Desktop Entry]
Version=1.0
Type=Application
Name=OmniStream Studio
GenericName=Audio and Karaoke Studio
Comment=NTK Hub local audio editing, lyrics and karaoke video studio
Exec=omnistream-studio
TryExec=omnistream-studio
Icon=omnistream-studio
Terminal=false
Categories=AudioVideo;Audio;Video;AudioVideoEditing;
Keywords=music;lyrics;karaoke;audio;video;NTK;
StartupWMClass=OmniStreamStudio
DESKTOP
cp "$appdir/omnistream-studio.desktop" "$appdir/usr/share/applications/omnistream-studio.desktop"
ln -s omnistream-studio.png "$appdir/.DirIcon"
cat > "$appdir/AppRun" <<'APPRUN'
#!/bin/sh
set -eu
root=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
exec "$root/usr/bin/omnistream-studio" "$@"
APPRUN
chmod 755 "$appdir/AppRun" "$tool" "$runtime"
if command -v desktop-file-validate >/dev/null 2>&1; then desktop-file-validate "$appdir/omnistream-studio.desktop"; fi
# The pinned runtime prevents packaging from downloading a different one silently.
ARCH=x86_64 VERSION="$version" APPIMAGE_EXTRACT_AND_RUN=1 "$tool" --runtime-file "$runtime" --comp xz "$appdir" "$stage/OmniStreamStudio-$version-x86_64.AppImage"
mkdir -p "$debdir/DEBIAN"
cp -a "$appdir/usr" "$debdir/usr"
size=$(du -sk "$debdir/usr" | cut -f1)
cat > "$debdir/DEBIAN/control" <<CONTROL
Package: omnistream-studio
Version: $version-1
Section: sound
Priority: optional
Architecture: amd64
Maintainer: NTK Hub
Installed-Size: $size
Depends: ca-certificates, xdg-utils
Recommends: chromium | chromium-browser | google-chrome-stable | microsoft-edge-stable
Description: NTK Hub audio and karaoke studio
 Local audio importing, lyrics editing, mastering and karaoke video export.
 Uses an installed Chromium browser in a dedicated app window and profile.
 Other installed default browsers can open the stable local URL as a fallback.
 No remote service or account is required for core local editing.
CONTROL
find "$debdir" -type d -exec chmod 755 {} +
find "$debdir" -type f ! -path '*/bin/omnistream-studio' -exec chmod 644 {} +
dpkg-deb --root-owner-group --build "$debdir" "$stage/omnistream-studio_${version}-1_amd64.deb"
# Retain previous releases beside the current output instead of deleting them.
for name in "OmniStreamStudio-$version-x86_64.AppImage" "omnistream-studio_${version}-1_amd64.deb"; do
    if [ -e "$output/$name" ]; then mv -- "$output/$name" "$stage/previous-$name"; fi
    cp -- "$stage/$name" "$output/$name"
done
chmod 755 "$output/OmniStreamStudio-$version-x86_64.AppImage"
cp "$script_dir/README-LINUX.md" "$output/README-LINUX.md"
sha256sum "$output/OmniStreamStudio-$version-x86_64.AppImage" "$output/omnistream-studio_${version}-1_amd64.deb"
echo "Preserved packaging stage: $stage"
