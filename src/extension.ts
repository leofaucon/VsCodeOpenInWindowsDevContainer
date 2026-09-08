import * as vscode from "vscode";
import { DockerClient } from "./docker/dockerClient";
import { locateDevContainer } from "./resolver/containerLocator";
import {
    assertWindowsPathExists,
    resolveWindowsPath,
} from "./resolver/mountResolver";
import { openInWindowsExplorer } from "./windows/windowsLauncher";

const OPEN_COMMAND = "openInWindowsDevContainer.openInExplorer";
const COPY_COMMAND = "openInWindowsDevContainer.copyWindowsPath";

type CommandAction = "open" | "copy";

/**
 * Registers the Explorer and Command Palette commands in the local UI extension host.
 */
export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel("Open in Windows", { log: true });
    const dockerClient = new DockerClient();

    logInfo(
        output,
        `Extension activated (platform=${process.platform}, remoteName=${vscode.env.remoteName ?? "<none>"}, uiKind=${vscode.UIKind[vscode.env.uiKind]}).`,
    );

    const openCommand = vscode.commands.registerCommand(
        OPEN_COMMAND,
        async (resourceUri: vscode.Uri | undefined): Promise<void> =>
            runCommand("open", resourceUri, dockerClient, output),
    );
    const copyCommand = vscode.commands.registerCommand(
        COPY_COMMAND,
        async (resourceUri: vscode.Uri | undefined): Promise<void> =>
            runCommand("copy", resourceUri, dockerClient, output),
    );

    context.subscriptions.push(output, openCommand, copyCommand);
}

/**
 * Resolves the selected or active remote resource and performs the requested Windows action.
 */
async function runCommand(
    action: CommandAction,
    resourceUri: vscode.Uri | undefined,
    dockerClient: DockerClient,
    output: vscode.LogOutputChannel,
): Promise<void> {
    output.show(true);
    logInfo(
        output,
        `Command invoked (action=${action}, argument=${formatUri(resourceUri)}, activeEditor=${formatUri(vscode.window.activeTextEditor?.document.uri)}).`,
    );

    try {
        validateHostEnvironment();
        logInfo(output, "Host environment validated.");

        const selectedResourceUri = await selectResourceUri(resourceUri, output);
        if (selectedResourceUri === undefined) {
            logInfo(output, "Command cancelled because no resource was selected.");
            return;
        }

        validateResourceUri(selectedResourceUri);
        logInfo(output, `Resource validated: ${formatUri(selectedResourceUri)}.`);

        logInfo(output, "Reading remote resource metadata.");
        const remoteStat = await vscode.workspace.fs.stat(selectedResourceUri);
        const isDirectory = (remoteStat.type & vscode.FileType.Directory) !== 0;
        logInfo(output, `Remote resource metadata read (isDirectory=${String(isDirectory)}).`);

        logInfo(output, "Reading the remote container hostname.");
        const remoteHostname = await readRemoteHostname(selectedResourceUri, output);
        logInfo(output, `Remote hostname result: ${remoteHostname ?? "<unavailable>"}.`);

        logInfo(output, "Listing and inspecting running Docker containers.");
        const containers = await dockerClient.listRunningContainers();
        logInfo(output, `Docker returned ${String(containers.length)} running container(s).`);

        const container = locateDevContainer(containers, {
            remoteAuthority: selectedResourceUri.authority,
            remoteHostname,
        });
        logInfo(output, `Matched Docker container ${container.Name} (${container.Id.slice(0, 12)}).`);

        const windowsPath = assertWindowsPathExists(
            resolveWindowsPath(selectedResourceUri.path, container.Mounts),
        );
        logInfo(output, `Resolved ${selectedResourceUri.path} to ${windowsPath}.`);

        if (action === "copy") {
            logInfo(output, "Writing the Windows path to the clipboard.");
            await vscode.env.clipboard.writeText(windowsPath);
            logInfo(output, "Windows path copied successfully.");
            await vscode.window.showInformationMessage(`Windows path copied: ${windowsPath}`);
            return;
        }

        logInfo(output, "Launching Windows Explorer.");
        await openInWindowsExplorer(windowsPath, isDirectory);
        logInfo(output, "Windows Explorer launched successfully.");
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const detail = error instanceof Error ? (error.stack ?? error.message) : String(error);
        logError(output, `Command failed: ${detail}`);
        await vscode.window.showErrorMessage(`Open in Windows: ${message}`);
    }
}

/**
 * Rejects unsupported hosts and remote window types before resource selection.
 */
function validateHostEnvironment(): void {
    if (process.platform !== "win32") {
        throw new Error(
            "This extension must run in the local Windows UI extension host. Install the VSIX locally, not in the container.",
        );
    }

    if (vscode.env.remoteName !== "dev-container") {
        throw new Error("This command is available only in a Dev Container window.");
    }
}

/**
 * Uses an explicit Explorer resource, the active editor, or a remote file picker.
 */
async function selectResourceUri(
    resourceUri: vscode.Uri | undefined,
    output: vscode.LogOutputChannel,
): Promise<vscode.Uri | undefined> {
    if (resourceUri !== undefined) {
        logInfo(output, "Using the resource supplied by the invoking menu.");
        return resourceUri;
    }

    const activeEditorUri = vscode.window.activeTextEditor?.document.uri;
    if (isDevContainerResource(activeEditorUri)) {
        logInfo(output, "Using the active Dev Container editor.");
        return activeEditorUri;
    }

    const defaultUri = vscode.workspace.workspaceFolders
        ?.map((folder) => folder.uri)
        .find(isDevContainerResource);
    logInfo(
        output,
        `No active Dev Container editor; opening the remote resource picker (default=${formatUri(defaultUri)}).`,
    );
    const selectedUris = await vscode.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: true,
        canSelectMany: false,
        defaultUri,
        openLabel: "Select for Open in Windows",
    });

    logInfo(output, `Remote resource picker returned ${formatUri(selectedUris?.[0])}.`);
    return selectedUris?.[0];
}

/**
 * Reports whether a URI belongs to the current Dev Container filesystem.
 */
function isDevContainerResource(resourceUri: vscode.Uri | undefined): resourceUri is vscode.Uri {
    return resourceUri?.scheme === "vscode-remote"
        && resourceUri.authority.startsWith("dev-container+");
}

/**
 * Rejects resources outside the current Dev Container filesystem.
 */
function validateResourceUri(resourceUri: vscode.Uri): void {
    if (isDevContainerResource(resourceUri) === false) {
        throw new Error("Select a file or folder in the Dev Container Explorer and try again.");
    }
}

/**
 * Reads the container hostname through the remote filesystem for extra correlation.
 */
async function readRemoteHostname(
    resourceUri: vscode.Uri,
    output: vscode.LogOutputChannel,
): Promise<string | undefined> {
    const hostnameUri = vscode.Uri.from({
        scheme: resourceUri.scheme,
        authority: resourceUri.authority,
        path: "/etc/hostname",
    });

    try {
        const content = await vscode.workspace.fs.readFile(hostnameUri);
        const hostname = new TextDecoder().decode(content).trim();
        return hostname.length > 0 ? hostname : undefined;
    } catch (error: unknown) {
        const detail = error instanceof Error ? error.message : String(error);
        logWarning(output, `Remote hostname unavailable; using authority labels only: ${detail}`);
        return undefined;
    }
}

/**
 * Formats an optional URI for diagnostics without its query or fragment.
 */
function formatUri(resourceUri: vscode.Uri | undefined): string {
    if (resourceUri === undefined) {
        return "<none>";
    }

    return `${resourceUri.scheme}://${resourceUri.authority}${resourceUri.path}`;
}

/**
 * Writes an informational message to both extension diagnostic destinations.
 */
function logInfo(output: vscode.LogOutputChannel, message: string): void {
    output.info(message);
    console.info(`[Open in Windows] ${message}`);
}

/**
 * Writes a warning message to both extension diagnostic destinations.
 */
function logWarning(output: vscode.LogOutputChannel, message: string): void {
    output.warn(message);
    console.warn(`[Open in Windows] ${message}`);
}

/**
 * Writes an error message to both extension diagnostic destinations.
 */
function logError(output: vscode.LogOutputChannel, message: string): void {
    output.error(message);
    console.error(`[Open in Windows] ${message}`);
}
