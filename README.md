# Open in Windows

Open in Windows is a small VS Code and Cursor extension for Windows users working
inside a Dev Container. It maps a selected container file or folder back to the
effective Windows bind mount, then either opens it in Windows Explorer or copies
its native Windows path.

For example:

```text
Container: /workspaces/sample/src/index.ts
Windows:   C:\Users\me\Projects\sample\src\index.ts
```

The extension ID is `leofaucon.open-in-windows-devcontainer`. The extension is
declared as a UI extension, so its Node.js process and Docker CLI calls run on
the Windows host rather than inside the container.

## MVP features

- **Open in Windows Explorer** opens a selected folder or selects a file with
  `explorer.exe`.
- **Copy Windows Path** writes the resolved native path to the system clipboard.
- Both commands appear in the Explorer context menu only when
  `remoteName == dev-container`.
- Both commands are available from the Command Palette. They use the active
  remote editor or prompt for a file or folder when no remote editor is active.
- The current container is correlated with the remote window instead of being
  selected by list order.
- Nested mounts use the longest matching container destination.
- Docker volumes, unsupported host sources, missing paths, and ambiguous
  containers fail explicitly.

## Requirements

- Windows 10 or later.
- Desktop VS Code or Cursor. Browser-based editors are not supported.
- Docker Desktop installed, running, and accessible through the `docker` CLI
  from the Windows user session.
- The Microsoft Dev Containers extension (or Cursor's compatible Dev Containers
  support).
- A selected path backed by a local bind mount.

The extension supports native sources such as `C:\Projects\sample` and the
Docker Desktop forms `/host_mnt/c/Projects/sample` and
`/run/desktop/mnt/host/c/Projects/sample`.

## Build and package

Use Node.js `^22.13.0 || >=24`; the minimum supported version is 22.13.0,
as required by the locked development tooling.

Install the exact locked dependencies and create the standalone VSIX from the
repository root:

```powershell
npm ci
npm run package:vsix
```

`npm run package:vsix` runs lint, compiles the TypeScript sources, executes the
tests, and then packages the extension. The result is
`open-in-windows-devcontainer-0.1.3.vsix`.

## Install manually without the Marketplace

In VS Code or Cursor:

1. Open the Extensions view.
2. Open the view's `...` menu.
3. Choose **Extensions: Install from VSIX...**.
4. Select the generated VSIX.
5. If prompted, choose the local installation target and reload the window.

The command-line equivalents are:

```powershell
code --install-extension .\open-in-windows-devcontainer-0.1.3.vsix --force
cursor --install-extension .\open-in-windows-devcontainer-0.1.3.vsix --force
```

The extension must be installed on the local/host side of the Dev Container
window. Do not install it only in the container. In the Extensions view, use the
**Local - Installed** section to verify its location.

To update, build a VSIX with the newer version and run the same install command;
the editor replaces the installed version. To uninstall:

```powershell
code --uninstall-extension leofaucon.open-in-windows-devcontainer
cursor --uninstall-extension leofaucon.open-in-windows-devcontainer
```

## Use

1. Open a folder in a Dev Container.
2. Right-click a file or folder in the Explorer.
3. Select **Open in Windows Explorer** or **Copy Windows Path**.

Alternatively, run either command from the Command Palette. The command uses
the active Dev Container editor when available; otherwise it opens a remote
file and folder picker.

For a file, Explorer opens its containing folder and selects the file. For a
directory, Explorer opens the directory directly.

## How resolution works

Resolution deliberately uses the effective Docker state:

1. The UI extension asks `docker container ls` for full running container IDs.
2. It calls `docker container inspect` without a command shell and validates the
   response fields it consumes.
3. It restricts candidates to containers carrying Dev Container labels.
4. It decodes the optional `hostPath` from the `dev-container+...` remote
   authority and reads `/etc/hostname` through VS Code's remote filesystem API.
5. It scores exact local-folder and hostname matches. A tied best match is
   rejected as ambiguous.
6. It finds all inspected mounts containing the selected POSIX path on a full
   segment boundary, then selects the longest destination.
7. It requires that effective mount to be a bind mount and translates only
   recognized Windows or Docker Desktop sources.
8. It verifies that the resulting host path exists before copying or opening it.

Docker commands are passed as executable arguments, never composed as shell
text. Explorer is also launched with a separate argument array.

## Bind mounts and expected errors

A path can be mapped only when Docker exposes the content as a Windows bind
mount. Named volumes are intentionally rejected because they do not have a
stable Windows filesystem path.

Expected failures include:

- **Docker unavailable or inaccessible**: start Docker Desktop and confirm
  `docker container ls` works in a normal Windows terminal.
- **No matching Dev Container**: reopen the folder in its container and make
  sure the window uses the same local Docker Desktop context.
- **Multiple matching Dev Containers**: stop duplicate running containers. The
  extension will not guess.
- **Outside every Windows bind mount**: select content under the workspace bind
  mount, or add an explicit bind mount to `devcontainer.json`.
- **Stored in a Docker volume**: copy or expose the content through a bind mount
  if a Windows path is required.
- **Mount source cannot be translated**: use a native Windows source or a
  supported Docker Desktop host path.
- **Resolved path does not exist**: inspect Docker Desktop file sharing, the
  source path, and the container's current mount configuration.

Detailed command diagnostics are available in the **Open in Windows** output
channel. The channel opens automatically when either command starts and traces
resource selection, remote filesystem access, Docker correlation, path
resolution, clipboard access, and Windows Explorer launch.

To inspect these diagnostics manually, open **View > Output**, then select
**Open in Windows** from the channel selector in the Output panel. Run either
extension command first if the channel is not listed yet.

## Limitations

- Local Windows Docker Desktop containers only. Remote Docker daemons,
  SSH-hosted containers, WSL-only host paths, Codespaces, and Linux/macOS hosts
  are outside this MVP.
- Named volumes and non-bind mounts cannot be opened as Windows paths.
- Only the selected Explorer resource is processed; multi-selection is not
  supported.
- Mapping is lexical. A symlink inside a bind mount that resolves into another
  mount is not followed before resolution.
- The implementation relies on Dev Containers authority and label conventions.
  Unknown future formats fail safely instead of selecting an arbitrary
  container.

## Troubleshooting

Verify host-side Docker first:

```powershell
docker container ls --quiet --no-trunc
docker container inspect <container-id>
```

Inspect the target container's `Config.Labels` and `Mounts`. The container
should have a `devcontainer.local_folder` label and the selected path should be
below a `Type: "bind"` destination.

If the commands are missing, confirm that:

- the current window reports a Dev Container connection;
- the extension is enabled and installed locally;
- the desktop editor was reloaded after VSIX installation.

Cursor's Agents Window uses a lightweight **Files** tab rather than the
standard VS Code Explorer, so `explorer/context` menu contributions may not
appear there. Use the Command Palette or open Cursor's classic Editor Window
for the Explorer context menu.

The **Open Editors** context menu is also unsupported because VS Code does not
expose a public menu contribution point for that view. Use the File Explorer
context menu or run a command from the Command Palette with the editor active.

## Development

For a faster development loop after `npm ci`, compile, lint, and test without
creating a VSIX:

```powershell
npm run compile
npm run lint
npm test
```

Press `F5` in VS Code or Cursor to launch an Extension Development Host using
`.vscode/launch.json`. The resolver and locator tests are compiled to `out/test`
and run with Mocha.

Source layout:

- `src/docker/dockerClient.ts` owns Docker process execution and inspect
  validation.
- `src/resolver/containerLocator.ts` identifies one active Dev Container.
- `src/resolver/mountResolver.ts` performs mount and path resolution.
- `src/windows/windowsLauncher.ts` launches Windows Explorer.
- `src/extension.ts` connects VS Code APIs to the resolver.

## Compatibility

The manifest requires VS Code API `^1.90.0` and uses stable extension APIs.
VS Code and Cursor both support local VSIX installation and the extension host
model used here. Cursor compatibility still depends on its bundled VS Code API
level and Dev Containers implementation; use a current desktop release.
