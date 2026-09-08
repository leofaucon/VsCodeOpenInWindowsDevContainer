import { existsSync } from "node:fs";
import path from "node:path";
import type { DockerMount } from "../docker/dockerClient";

export class PathResolutionError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "PathResolutionError";
    }
}

export class VolumeMountError extends PathResolutionError {
    public constructor(containerPath: string) {
        super(
            `The selected path "${containerPath}" is stored in a Docker volume, not a Windows bind mount.`,
        );
        this.name = "VolumeMountError";
    }
}

export class OutsideBindMountError extends PathResolutionError {
    public constructor(containerPath: string) {
        super(
            `The selected path "${containerPath}" is outside every Windows bind mount in this container.`,
        );
        this.name = "OutsideBindMountError";
    }
}

export class UnsupportedMountSourceError extends PathResolutionError {
    public constructor(source: string) {
        super(
            `The bind mount source "${source}" cannot be translated to a Windows path. Use a Windows or Docker Desktop host path.`,
        );
        this.name = "UnsupportedMountSourceError";
    }
}

export class HostPathNotFoundError extends PathResolutionError {
    public constructor(hostPath: string) {
        super(
            `The resolved Windows path "${hostPath}" does not exist. Check Docker Desktop file sharing and the bind mount.`,
        );
        this.name = "HostPathNotFoundError";
    }
}

/**
 * Resolves a container path through the most specific effective mount.
 */
export function resolveWindowsPath(
    containerPath: string,
    mounts: readonly DockerMount[],
): string {
    const normalizedPath = normalizeContainerPath(containerPath);
    const matchingMounts = mounts
        .map((mount) => ({
            mount,
            destination: normalizeContainerPath(mount.Destination),
        }))
        .filter(({ destination }) => isWithinMount(normalizedPath, destination))
        .sort((left, right) => right.destination.length - left.destination.length);

    const selected = matchingMounts[0];
    if (selected === undefined) {
        throw new OutsideBindMountError(containerPath);
    }

    if (selected.mount.Type !== "bind") {
        if (selected.mount.Type === "volume") {
            throw new VolumeMountError(containerPath);
        }

        throw new OutsideBindMountError(containerPath);
    }

    const windowsSource = translateMountSource(selected.mount.Source);
    const suffix = getMountSuffix(normalizedPath, selected.destination);
    if (suffix.length === 0) {
        return path.win32.normalize(windowsSource);
    }

    return path.win32.join(windowsSource, ...suffix.split("/"));
}

/**
 * Verifies that a resolved path still exists on the Windows host.
 */
export function assertWindowsPathExists(
    hostPath: string,
    pathExists: (candidate: string) => boolean = existsSync,
): string {
    if (pathExists(hostPath) === false) {
        throw new HostPathNotFoundError(hostPath);
    }

    return hostPath;
}

/**
 * Converts supported Docker bind sources into native Windows paths.
 */
function translateMountSource(source: string): string {
    const nativePath = /^([a-z]):[\\/](.*)$/iu.exec(source);
    if (nativePath !== null) {
        const drive = nativePath[1]?.toUpperCase();
        const remainder = nativePath[2] ?? "";
        return path.win32.normalize(`${drive}:\\${remainder}`);
    }

    const dockerDesktopPath =
        /^\/(?:host_mnt|run\/desktop\/mnt\/host)\/([a-z])(?:\/(.*))?$/iu.exec(source);
    if (dockerDesktopPath !== null) {
        const drive = dockerDesktopPath[1]?.toUpperCase();
        const remainder = dockerDesktopPath[2] ?? "";
        return path.win32.normalize(`${drive}:\\${remainder}`);
    }

    throw new UnsupportedMountSourceError(source);
}

/**
 * Normalizes and validates a Linux container path.
 */
function normalizeContainerPath(containerPath: string): string {
    if (path.posix.isAbsolute(containerPath) === false) {
        throw new OutsideBindMountError(containerPath);
    }

    return path.posix.normalize(containerPath);
}

/**
 * Tests mount membership on a complete path-segment boundary.
 */
function isWithinMount(containerPath: string, destination: string): boolean {
    if (destination === "/") {
        return true;
    }

    return containerPath === destination || containerPath.startsWith(`${destination}/`);
}

/**
 * Returns the POSIX path suffix below a mount destination.
 */
function getMountSuffix(containerPath: string, destination: string): string {
    if (destination === "/") {
        return containerPath.slice(1);
    }

    return containerPath.slice(destination.length).replace(/^\/+/u, "");
}
