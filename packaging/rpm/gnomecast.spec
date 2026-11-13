Name:           gnomecast
Version:        0.1.0
Release:        1%{?dist}
Summary:        Fast, keyboard-first Raycast-style launcher for GNOME

License:        MIT
URL:            https://github.com/ismeetxd/gnomecast

Requires:       gjs
Requires:       gtk4
Requires:       libadwaita
Requires:       glib2
Requires:       jq
Requires:       wl-clipboard
Requires:       libnotify
Requires:       systemd

Recommends:     gnome-shell-extension-common

%description
Gnomecast is a fast, keyboard-first Raycast-style launcher for GNOME (Fedora Workstation).
It runs natively via a persistent GJS + GTK4/Libadwaita daemon, a companion GNOME Shell
extension, and an optional flea-search Rust accelerator.

%install
rm -rf %{buildroot}
mkdir -p %{buildroot}%{_bindir}
mkdir -p %{buildroot}%{_datadir}/gnomecast
mkdir -p %{buildroot}%{_datadir}/applications
mkdir -p %{buildroot}%{_datadir}/dbus-1/services
mkdir -p %{buildroot}%{_prefix}/lib/systemd/user
mkdir -p %{buildroot}%{_datadir}/gnome-shell/extensions/gnomecast@ismeetxd.dev

SRCDIR="%{_sourcedir}"
if [ ! -d "$SRCDIR/core" ]; then
    SRCDIR="."
fi

# Copy application files
cp -a "$SRCDIR/core" %{buildroot}%{_datadir}/gnomecast/
cp -a "$SRCDIR/gnome" %{buildroot}%{_datadir}/gnomecast/
cp -a "$SRCDIR/assets" %{buildroot}%{_datadir}/gnomecast/
mkdir -p %{buildroot}%{_datadir}/gnomecast/bin
cp -a "$SRCDIR/bin/gnomecast" %{buildroot}%{_datadir}/gnomecast/bin/
if [ -f "$SRCDIR/bin/gnomecast-search" ]; then
    cp -a "$SRCDIR/bin/gnomecast-search" %{buildroot}%{_datadir}/gnomecast/bin/
fi

# Symlink CLI
ln -sf %{_datadir}/gnomecast/bin/gnomecast %{buildroot}%{_bindir}/gnomecast

# Icons
for size in 16x16 24x24 32x32 48x48 64x64 128x128 256x256 512x512; do
    icon_file="$SRCDIR/assets/icons/hicolor/$size/apps/dev.ismeetxd.Gnomecast.png"
    if [ -f "$icon_file" ]; then
        mkdir -p %{buildroot}%{_datadir}/icons/hicolor/$size/apps
        cp -a "$icon_file" %{buildroot}%{_datadir}/icons/hicolor/$size/apps/
    fi
done

# Desktop files
cat > %{buildroot}%{_datadir}/applications/dev.ismeetxd.Gnomecast.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=Gnomecast
Comment=Raycast-style launcher for GNOME
Exec=%{_bindir}/gnomecast toggle
Icon=dev.ismeetxd.Gnomecast
Terminal=false
NoDisplay=true
DBusActivatable=true
Categories=Utility;
StartupWMClass=dev.ismeetxd.Gnomecast
EOF

cat > %{buildroot}%{_datadir}/applications/dev.ismeetxd.GnomecastSettings.desktop << 'EOF'
[Desktop Entry]
Type=Application
Name=Gnomecast
GenericName=Launcher Shortcut Toggle
Comment=Turn Windows+Space launcher shortcut on or off
Exec=%{_bindir}/gnomecast app
Icon=dev.ismeetxd.Gnomecast
Terminal=false
NoDisplay=false
Categories=Utility;
Keywords=gnomecast;launcher;shortcut;super;space;raycast;
StartupWMClass=dev.ismeetxd.GnomecastSettings
EOF

# D-Bus service
cat > %{buildroot}%{_datadir}/dbus-1/services/dev.ismeetxd.Gnomecast.service << 'EOF'
[D-BUS Service]
Name=dev.ismeetxd.Gnomecast
Exec=/usr/bin/gjs -m %{_datadir}/gnomecast/gnome/daemon.js --hidden
SystemdService=gnomecast.service
EOF

# Systemd user service
cat > %{buildroot}%{_prefix}/lib/systemd/user/gnomecast.service << 'EOF'
[Unit]
Description=Gnomecast launcher daemon
PartOf=graphical-session.target
After=graphical-session.target

[Service]
Type=dbus
BusName=dev.ismeetxd.Gnomecast
ExecStart=/usr/bin/gjs -m %{_datadir}/gnomecast/gnome/daemon.js --hidden
Restart=on-failure
RestartSec=1

[Install]
WantedBy=graphical-session.target
EOF

# GNOME Shell extension
cp -a "$SRCDIR/gnome-extension/gnomecast@ismeetxd.dev/"* %{buildroot}%{_datadir}/gnome-shell/extensions/gnomecast@ismeetxd.dev/
if command -v glib-compile-schemas >/dev/null 2>&1; then
    glib-compile-schemas %{buildroot}%{_datadir}/gnome-shell/extensions/gnomecast@ismeetxd.dev/schemas 2>/dev/null || true
fi

%post
/bin/touch --no-create %{_datadir}/icons/hicolor &>/dev/null || :
update-desktop-database &> /dev/null || :

%postun
if [ $1 -eq 0 ] ; then
    /bin/touch --no-create %{_datadir}/icons/hicolor &>/dev/null
    gtk-update-icon-cache %{_datadir}/icons/hicolor &>/dev/null || :
fi
update-desktop-database &> /dev/null || :

%posttrans
gtk-update-icon-cache %{_datadir}/icons/hicolor &>/dev/null || :

%files
%{_bindir}/gnomecast
%{_datadir}/gnomecast/
%{_datadir}/applications/dev.ismeetxd.Gnomecast.desktop
%{_datadir}/applications/dev.ismeetxd.GnomecastSettings.desktop
%{_datadir}/icons/hicolor/*/apps/dev.ismeetxd.Gnomecast.png
%{_datadir}/dbus-1/services/dev.ismeetxd.Gnomecast.service
%{_prefix}/lib/systemd/user/gnomecast.service
%{_datadir}/gnome-shell/extensions/gnomecast@ismeetxd.dev/

%changelog
* Fri Nov 13 2026 ismeetxd <ismeetxd@users.noreply.github.com> - 0.1.0-1
- Initial Gnomecast package for Fedora
