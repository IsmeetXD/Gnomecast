#!/bin/bash
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
dist_dir="$repo/dist"
spec_file="$repo/packaging/rpm/gnomecast.spec"

echo "==> Building Gnomecast RPM package"

if ! command -v rpmbuild >/dev/null 2>&1; then
    echo "gnomecast: 'rpmbuild' is required to build RPMs on Fedora." >&2
    echo "Install it with:" >&2
    echo "    sudo dnf install rpm-build" >&2
    exit 1
fi

# Build Rust search helper if cargo exists and helper is missing
if [[ ! -x "$repo/bin/gnomecast-search" ]] && command -v cargo >/dev/null 2>&1; then
    echo "    Building flea-search helper with cargo..."
    "$repo/bin/build-search" || true
fi

rpm_topdir=$(mktemp -d "/tmp/gnomecast-rpm-build.XXXXXX")
trap 'rm -rf "$rpm_topdir"' EXIT

mkdir -p "$dist_dir"
mkdir -p "$rpm_topdir"/{BUILD,BUILDROOT,RPMS,SOURCES,SPECS,SRPMS}
cp -a "$spec_file" "$rpm_topdir/SPECS/gnomecast.spec"

echo "    Running rpmbuild..."
rpmbuild --define "_topdir $rpm_topdir" \
         --define "_sourcedir $repo" \
         -bb "$rpm_topdir/SPECS/gnomecast.spec"

# Move generated RPM(s) to dist/
find "$rpm_topdir/RPMS" -type f -name "*.rpm" -exec cp -f {} "$dist_dir/" \;

echo "==> Successfully generated RPM package(s) in $dist_dir:"
ls -lh "$dist_dir"/*.rpm
