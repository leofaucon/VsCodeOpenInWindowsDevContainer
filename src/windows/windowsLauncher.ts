import { spawn } from "node:child_process";

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
    const args = isDirectory ? [windowsPath] : [`/select,${windowsPath}`];

    await new Promise<void>((resolve, reject) => {
        const child = spawn("explorer.exe", args, {
            detached: true,
            stdio: "ignore",
            windowsHide: true,
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
