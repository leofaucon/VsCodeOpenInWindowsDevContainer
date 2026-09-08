import path from "node:path";
import type { DockerContainer } from "../docker/dockerClient";

const DEV_CONTAINER_LABELS = [
    "devcontainer.local_folder",
    "devcontainer.config_file",
    "dev.containers.id",
] as const;

export interface ContainerLocatorContext {
    readonly remoteAuthority: string;
    readonly remoteHostname?: string;
}

export class ContainerNotFoundError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "ContainerNotFoundError";
    }
}

export class AmbiguousContainerError extends Error {
    public constructor(message: string) {
        super(message);
        this.name = "AmbiguousContainerError";
    }
}

/**
 * Identifies the active Dev Container without selecting an arbitrary match.
 */
export function locateDevContainer(
    containers: readonly DockerContainer[],
    context: ContainerLocatorContext,
): DockerContainer {
    const candidates = containers.filter(isDevContainer);
    if (candidates.length === 0) {
        throw new ContainerNotFoundError(
            "No running Dev Container was found. Confirm that this window uses a local Docker Desktop container.",
        );
    }

    const hostPath = extractHostPath(context.remoteAuthority);
    const remoteHostname = context.remoteHostname?.trim();
    const hasCorrelationSignal = hostPath !== undefined || Boolean(remoteHostname);

    const scored = candidates
        .map((container) => ({
            container,
            score: Number(matchesHostPath(container, hostPath))
                + Number(matchesHostname(container, remoteHostname)),
        }))
        .filter((candidate) => candidate.score > 0);

    if (scored.length === 0) {
        if (hasCorrelationSignal === false && candidates.length === 1) {
            return candidates[0] as DockerContainer;
        }

        throw new ContainerNotFoundError(
            "No running Dev Container matches this remote window. Reopen the folder in its container and retry.",
        );
    }

    const highestScore = Math.max(...scored.map((candidate) => candidate.score));
    const bestMatches = scored.filter((candidate) => candidate.score === highestScore);
    if (bestMatches.length !== 1) {
        const names = bestMatches.map(({ container }) => displayName(container)).join(", ");
        throw new AmbiguousContainerError(
            `Multiple running Dev Containers match this window (${names}). Stop duplicate containers and retry.`,
        );
    }

    return bestMatches[0]?.container as DockerContainer;
}

/**
 * Extracts the host path encoded by the Dev Containers remote authority.
 */
export function extractHostPath(remoteAuthority: string): string | undefined {
    const match = /^dev-container\+([a-f0-9]+)(?:@.*)?$/iu.exec(remoteAuthority);
    const encoded = match?.[1];
    if (encoded === undefined || encoded.length % 2 !== 0) {
        return undefined;
    }

    try {
        const decoded = Buffer.from(encoded, "hex").toString("utf8");
        const parsed: unknown = JSON.parse(decoded);
        if (
            typeof parsed === "object"
            && parsed !== null
            && "hostPath" in parsed
            && typeof parsed.hostPath === "string"
        ) {
            return parsed.hostPath;
        }

        return undefined;
    } catch {
        try {
            const decoded = Buffer.from(encoded, "hex").toString("utf8").trim();
            return decoded.length > 0 ? decoded : undefined;
        } catch {
            return undefined;
        }
    }
}

/**
 * Detects labels used by the Dev Containers implementations.
 */
function isDevContainer(container: DockerContainer): boolean {
    return DEV_CONTAINER_LABELS.some((label) => label in container.Config.Labels);
}

/**
 * Compares the authority host path with the canonical Dev Container label.
 */
function matchesHostPath(container: DockerContainer, hostPath: string | undefined): boolean {
    if (hostPath === undefined) {
        return false;
    }

    const labelPath = container.Config.Labels["devcontainer.local_folder"];
    return labelPath !== undefined && normalizeHostPath(labelPath) === normalizeHostPath(hostPath);
}

/**
 * Compares a remote hostname against Docker's stable container identifiers.
 */
function matchesHostname(container: DockerContainer, remoteHostname: string | undefined): boolean {
    if (remoteHostname === undefined || remoteHostname.length === 0) {
        return false;
    }

    const expected = remoteHostname.toLowerCase();
    const names = [
        container.Config.Hostname,
        container.Name.replace(/^\/+/u, ""),
        container.Id,
        container.Id.slice(0, 12),
    ];
    return names.some((name) => name.toLowerCase() === expected);
}

/**
 * Normalizes host paths while preserving POSIX case sensitivity.
 */
function normalizeHostPath(hostPath: string): string {
    const value = hostPath.trim();
    if (/^(?:[a-z]:[\\/]|\\\\)/iu.test(value)) {
        return path.win32.normalize(value).replace(/[\\]+$/u, "").toLowerCase();
    }

    return path.posix.normalize(value).replace(/\/+$/u, "");
}

/**
 * Returns a useful container name for diagnostics.
 */
function displayName(container: DockerContainer): string {
    return container.Name.replace(/^\/+/u, "") || container.Id.slice(0, 12);
}
