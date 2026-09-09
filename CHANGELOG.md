# Changelog

All notable changes to this project will be documented in this file.

## 0.1.4 - 2026-09-09

### Added

- Added customizable default keyboard shortcuts for opening a resource in
  Windows Explorer (`Shift+Alt+O`) and copying its Windows path
  (`Shift+Alt+P`).

## 0.1.3 - 2026-09-08

### Added

- Added detailed Output and extension-host diagnostics for every command step.
- Added a separate Explorer context-menu group for the extension commands.

### Fixed

- Passed quoted Windows paths directly to Explorer's native command-line
  parser, including paths containing spaces.

### Changed

- Documented that VS Code does not expose the Open Editors context menu to
  extensions.

## 0.1.2 - 2026-09-08

### Added

- Added Command Palette support using the active Dev Container editor or a
  remote file and folder picker.

### Changed

- Documented the Cursor Agents Window context-menu limitation and workaround.

## 0.1.1 - 2026-09-08

### Changed

- Added the extension icon to packaged releases.
- Added author metadata while preserving the publisher and extension identifier.
- Documented how to build, package, and manually install the extension.

## 0.1.0 - 2026-09-08

### Added

- Explorer commands to open a Dev Container resource in Windows Explorer or
  copy its Windows path.
- Docker-based container correlation using Dev Container labels, remote
  authority host paths, and remote hostnames.
- Bind-mount resolution for native Windows and Docker Desktop mount sources.
- Explicit errors for ambiguous containers, volumes, unsupported sources,
  paths outside bind mounts, and missing host paths.
- Unit tests, local extension debugging configuration, and reproducible VSIX
  packaging.
