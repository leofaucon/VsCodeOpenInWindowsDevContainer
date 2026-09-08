import { spawn } from "node:child_process";
import path from "node:path";

export class WindowsExplorerError extends Error {
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "WindowsExplorerError";
    }
}

/**
 * Opens a directory or selects a file in Windows Explorer.
 */
export async function openInWindowsExplorer(
    windowsPath: string,
    isDirectory: boolean,
): Promise<void> {
    const explorerPath = path.join(process.env.SystemRoot ?? String.raw`C:\Windows`, "explorer.exe");

    // Explorer parses its raw command line instead of following normal argv rules.
    const quotedWindowsPath = `"${windowsPath}"`;
    const args = isDirectory ? [quotedWindowsPath] : [`/select,${quotedWindowsPath}`];

    await new Promise<void>((resolve, reject) => {
        const child = spawn(explorerPath, args, {
            detached: true,
            stdio: "ignore",
            windowsHide: false,
            windowsVerbatimArguments: true,
        });

        child.once("error", (error) => {
            reject(
                new WindowsExplorerError(
                    `Windows Explorer could not open "${windowsPath}": ${error.message}`,
                    { cause: error },
                ),
            );
        });
        child.once("spawn", () => {
            child.unref();
            resolve();
        });
    });
}
