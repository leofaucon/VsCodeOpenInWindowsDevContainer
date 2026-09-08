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
 * Registers the two Explorer commands in the local UI extension host.
 */
export function activate(context: vscode.ExtensionContext): void {
    const output = vscode.window.createOutputChannel("Open in Windows");
    const dockerClient = new DockerClient();

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
 * Resolves the selected remote resource and performs the requested Windows action.
 */
async function runCommand(
    action: CommandAction,
    resourceUri: vscode.Uri | undefined,
    dockerClient: DockerClient,
    output: vscode.OutputChannel,
): Promise<void> {
    try {
        validateEnvironment(resourceUri);
        const remoteStat = await vscode.workspace.fs.stat(resourceUri);
        const isDirectory = (remoteStat.type & vscode.FileType.Directory) !== 0;
        const remoteHostname = await readRemoteHostname(resourceUri, output);

        const containers = await dockerClient.listRunningContainers();
        const container = locateDevContainer(containers, {
            remoteAuthority: resourceUri.authority,
            remoteHostname,
        });
        const windowsPath = assertWindowsPathExists(
            resolveWindowsPath(resourceUri.path, container.Mounts),
        );

        output.appendLine(
            `${action === "copy" ? "Copying" : "Opening"} ${resourceUri.path} as ${windowsPath}`,
        );

        if (action === "copy") {
            await vscode.env.clipboard.writeText(windowsPath);
            await vscode.window.showInformationMessage(`Windows path copied: ${windowsPath}`);
            return;
        }

        await openInWindowsExplorer(windowsPath, isDirectory);
    } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        output.appendLine(`Command failed: ${message}`);
        await vscode.window.showErrorMessage(`Open in Windows: ${message}`);
    }
}

/**
 * Rejects unsupported hosts, remotes, and command invocations before Docker access.
 */
function validateEnvironment(resourceUri: vscode.Uri | undefined): asserts resourceUri is vscode.Uri {
    if (process.platform !== "win32") {
        throw new Error(
            "This extension must run in the local Windows UI extension host. Install the VSIX locally, not in the container.",
        );
    }

    if (vscode.env.remoteName !== "dev-container") {
        throw new Error("This command is available only in a Dev Container window.");
    }

    if (
        resourceUri === undefined
        || resourceUri.scheme !== "vscode-remote"
        || resourceUri.authority.startsWith("dev-container+") === false
    ) {
        throw new Error("Select a file or folder in the Dev Container Explorer and try again.");
    }
}

/**
 * Reads the container hostname through the remote filesystem for extra correlation.
 */
async function readRemoteHostname(
    resourceUri: vscode.Uri,
    output: vscode.OutputChannel,
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
        output.appendLine(`Remote hostname unavailable; using authority labels only: ${detail}`);
        return undefined;
    }
}
