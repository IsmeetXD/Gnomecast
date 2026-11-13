#!/bin/bash
set -euo pipefail

repo=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)
target="${1:-all}"

case "$target" in
    deb)
        "$repo/packaging/build-deb.sh"
        ;;
    rpm)
        "$repo/packaging/build-rpm.sh"
        ;;
    all)
        echo "Building all packages for Gnomecast..."
        "$repo/packaging/build-deb.sh"
        echo ""
        if command -v rpmbuild >/dev/null 2>&1; then
            "$repo/packaging/build-rpm.sh"
        else
            echo "==> Skipping RPM build: 'rpmbuild' is not installed."
            echo "    To build RPM on Fedora, run: sudo dnf install rpm-build"
        fi
        ;;
    *)
        echo "Usage: $0 [deb|rpm|all]" >&2
        exit 1
        ;;
esac
