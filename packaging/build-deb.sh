#!/bin/bash
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
version="0.1.0"
arch="amd64"
pkg_name="gnomecast_${version}-1_${arch}.deb"
dist_dir="$repo/dist"
staging_dir=$(mktemp -d "/tmp/gnomecast-deb-build.XXXXXX")
trap 'rm -rf "$staging_dir"' EXIT

echo "==> Building Gnomecast DEB package ($pkg_name)"

# 1. Build Rust search helper if cargo exists and helper is missing
if [[ ! -x "$repo/bin/gnomecast-search" ]] && command -v cargo >/dev/null 2>&1; then
    echo "    Building flea-search helper with cargo..."
    "$repo/bin/build-search" || true
fi

# 2. Prepare directory structure
mkdir -p "$dist_dir"
mkdir -p "$staging_dir/DEBIAN"
mkdir -p "$staging_dir/usr/bin"
mkdir -p "$staging_dir/usr/share/gnomecast/bin"
mkdir -p "$staging_dir/usr/share/applications"
mkdir -p "$staging_dir/usr/share/dbus-1/services"
mkdir -p "$staging_dir/usr/lib/systemd/user"
mkdir -p "$staging_dir/usr/share/gnome-shell/extensions/gnomecast@ismeetxd.dev"

# 3. Copy application files
cp -a "$repo/core" "$staging_dir/usr/share/gnomecast/"
cp -a "$repo/gnome" "$staging_dir/usr/share/gnomecast/"
cp -a "$repo/assets" "$staging_dir/usr/share/gnomecast/"
cp -a "$repo/bin/gnomecast" "$staging_dir/usr/share/gnomecast/bin/"
if [[ -f "$repo/bin/gnomecast-search" ]]; then
    cp -a "$repo/bin/gnomecast-search" "$staging_dir/usr/share/gnomecast/bin/"
fi

# Symlink CLI
ln -sf /usr/share/gnomecast/bin/gnomecast "$staging_dir/usr/bin/gnomecast"

# Copy icons
for size in 16x16 24x24 32x32 48x48 64x64 128x128 256x256 512x512; do
    icon_src="$repo/assets/icons/hicolor/$size/apps/dev.ismeetxd.Gnomecast.png"
    if [[ -f "$icon_src" ]]; then
        icon_dest="$staging_dir/usr/share/icons/hicolor/$size/apps"
        mkdir -p "$icon_dest"
        cp -a "$icon_src" "$icon_dest/dev.ismeetxd.Gnomecast.png"
    fi
done

# Copy desktop entries
cat > "$staging_dir/usr/share/applications/dev.ismeetxd.Gnomecast.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=Gnomecast
Comment=Raycast-style launcher for GNOME
Exec=/usr/bin/gnomecast toggle
Icon=dev.ismeetxd.Gnomecast
Terminal=false
NoDisplay=true
DBusActivatable=true
Categories=Utility;
StartupWMClass=dev.ismeetxd.Gnomecast
EOF

cat > "$staging_dir/usr/share/applications/dev.ismeetxd.GnomecastSettings.desktop" << 'EOF'
[Desktop Entry]
Type=Application
Name=Gnomecast
GenericName=Launcher Shortcut Toggle
Comment=Turn Windows+Space launcher shortcut on or off
Exec=/usr/bin/gnomecast app
Icon=dev.ismeetxd.Gnomecast
Terminal=false
NoDisplay=false
Categories=Utility;
Keywords=gnomecast;launcher;shortcut;super;space;raycast;
StartupWMClass=dev.ismeetxd.GnomecastSettings
EOF

# Copy D-Bus service
cat > "$staging_dir/usr/share/dbus-1/services/dev.ismeetxd.Gnomecast.service" << 'EOF'
[D-BUS Service]
Name=dev.ismeetxd.Gnomecast
Exec=/usr/bin/gjs -m /usr/share/gnomecast/gnome/daemon.js --hidden
SystemdService=gnomecast.service
EOF

# Copy systemd user service
cat > "$staging_dir/usr/lib/systemd/user/gnomecast.service" << 'EOF'
[Unit]
Description=Gnomecast launcher daemon
PartOf=graphical-session.target
After=graphical-session.target

[Service]
Type=dbus
BusName=dev.ismeetxd.Gnomecast
ExecStart=/usr/bin/gjs -m /usr/share/gnomecast/gnome/daemon.js --hidden
Restart=on-failure
RestartSec=1

[Install]
WantedBy=graphical-session.target
EOF

# Copy GNOME Shell extension
cp -a "$repo/gnome-extension/gnomecast@ismeetxd.dev/"* "$staging_dir/usr/share/gnome-shell/extensions/gnomecast@ismeetxd.dev/"
if command -v glib-compile-schemas >/dev/null 2>&1; then
    glib-compile-schemas "$staging_dir/usr/share/gnome-shell/extensions/gnomecast@ismeetxd.dev/schemas" 2>/dev/null || true
fi

# 4. Copy control and maintainer scripts
installed_size=$(du -ks "$staging_dir/usr" | cut -f1)
sed "s/^Architecture:.*/Architecture: $arch/" "$repo/packaging/deb/control" > "$staging_dir/DEBIAN/control"
echo "Installed-Size: $installed_size" >> "$staging_dir/DEBIAN/control"

cp -a "$repo/packaging/deb/postinst" "$staging_dir/DEBIAN/postinst"
cp -a "$repo/packaging/deb/postrm" "$staging_dir/DEBIAN/postrm"
chmod 755 "$staging_dir/DEBIAN/postinst" "$staging_dir/DEBIAN/postrm"

# 5. Build deb archive
output_deb="$dist_dir/$pkg_name"
rm -f "$output_deb"

if command -v dpkg-deb >/dev/null 2>&1; then
    echo "    Packaging with dpkg-deb..."
    dpkg-deb --build --root-owner-group "$staging_dir" "$output_deb" >/dev/null
else
    echo "    dpkg-deb not present; packaging natively using ar + tar..."
    tmp_pkg=$(mktemp -d "/tmp/gnomecast-deb-ar.XXXXXX")
    trap 'rm -rf "$staging_dir" "$tmp_pkg"' EXIT

    printf "2.0\n" > "$tmp_pkg/debian-binary"
    (
        cd "$staging_dir/DEBIAN"
        tar --owner=0 --group=0 --numeric-owner -czf "$tmp_pkg/control.tar.gz" .
    )
    (
        cd "$staging_dir"
        tar --owner=0 --group=0 --numeric-owner --exclude='./DEBIAN' -czf "$tmp_pkg/data.tar.gz" .
    )
    (
        cd "$tmp_pkg"
        ar -rc "$output_deb" debian-binary control.tar.gz data.tar.gz
    )
fi

echo "==> Successfully generated: $output_deb"
ls -lh "$output_deb"
