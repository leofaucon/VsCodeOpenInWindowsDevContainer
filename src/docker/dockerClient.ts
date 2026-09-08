import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface DockerMount {
    readonly Type: string;
    readonly Source: string;
    readonly Destination: string;
}

export interface DockerContainer {
    readonly Id: string;
    readonly Name: string;
    readonly Config: {
        readonly Hostname: string;
        readonly Labels: Readonly<Record<string, string>>;
    };
    readonly Mounts: readonly DockerMount[];
}

export class DockerUnavailableError extends Error {
    public constructor(message: string, options?: ErrorOptions) {
        super(message, options);
        this.name = "DockerUnavailableError";
    }
}

/**
 * Runs the Docker CLI without involving a command shell.
 */
export class DockerClient {
    /**
     * Returns validated inspect data for every running container.
     */
    public async listRunningContainers(): Promise<readonly DockerContainer[]> {
        const ids = await this.listRunningContainerIds();
        if (ids.length === 0) {
            return [];
        }

        return this.inspectContainers(ids);
    }

    /**
     * Lists full IDs for running containers.
     */
    private async listRunningContainerIds(): Promise<readonly string[]> {
        const output = await this.runDocker(["container", "ls", "--quiet", "--no-trunc"]);
        if (output.trim().length === 0) {
            return [];
        }

        const ids = output
            .split(/\r?\n/u)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        if (ids.some((id) => /^[a-f0-9]{64}$/iu.test(id) === false)) {
            throw new DockerUnavailableError(
                "Docker returned an unexpected container list. Verify that the Docker CLI targets Docker Desktop.",
            );
        }

        return ids;
    }

    /**
     * Inspects the supplied container IDs in one Docker CLI invocation.
     */
    private async inspectContainers(ids: readonly string[]): Promise<readonly DockerContainer[]> {
        const output = await this.runDocker(["container", "inspect", ...ids]);

        let parsed: unknown;
        try {
            parsed = JSON.parse(output);
        } catch (error: unknown) {
            throw new DockerUnavailableError(
                "Docker returned invalid inspect data. Restart Docker Desktop and try again.",
                { cause: error },
            );
        }

        if (Array.isArray(parsed) === false) {
            throw new DockerUnavailableError("Docker inspect did not return a container list.");
        }

        return parsed.map((value, index) => this.validateContainer(value, index));
    }

    /**
     * Executes Docker and translates process failures into an actionable error.
     */
    private async runDocker(args: readonly string[]): Promise<string> {
        try {
            const result = await execFileAsync("docker", [...args], {
                encoding: "utf8",
                maxBuffer: 10 * 1024 * 1024,
                windowsHide: true,
            });
            return result.stdout;
        } catch (error: unknown) {
            const detail = error instanceof Error ? error.message : String(error);
            throw new DockerUnavailableError(
                `Docker is unavailable or inaccessible (${detail}). Install or start Docker Desktop, then retry.`,
                { cause: error },
            );
        }
    }

    /**
     * Validates the inspect fields consumed by the resolver.
     */
    private validateContainer(value: unknown, index: number): DockerContainer {
        if (isRecord(value) === false) {
            throw this.invalidInspect(index);
        }

        const config = value.Config;
        const mounts = value.Mounts;
        if (
            typeof value.Id !== "string"
            || typeof value.Name !== "string"
            || isRecord(config) === false
            || typeof config.Hostname !== "string"
            || (config.Labels !== null && isStringRecord(config.Labels) === false)
            || Array.isArray(mounts) === false
        ) {
            throw this.invalidInspect(index);
        }

        const validatedMounts = mounts.map((mount) => {
            if (
                isRecord(mount) === false
                || typeof mount.Type !== "string"
                || typeof mount.Source !== "string"
                || typeof mount.Destination !== "string"
            ) {
                throw this.invalidInspect(index);
            }

            return {
                Type: mount.Type,
                Source: mount.Source,
                Destination: mount.Destination,
            };
        });

        return {
            Id: value.Id,
            Name: value.Name,
            Config: {
                Hostname: config.Hostname,
                Labels: config.Labels ?? {},
            },
            Mounts: validatedMounts,
        };
    }

    /**
     * Creates a consistent validation error for one inspect entry.
     */
    private invalidInspect(index: number): DockerUnavailableError {
        return new DockerUnavailableError(
            `Docker inspect entry ${String(index + 1)} is missing fields required to resolve the Dev Container.`,
        );
    }
}

/**
 * Checks whether a value is a non-null object.
 */
function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

/**
 * Checks whether a value contains only string properties.
 */
function isStringRecord(value: unknown): value is Record<string, string> {
    if (isRecord(value) === false) {
        return false;
    }

    return Object.values(value).every((entry) => typeof entry === "string");
}
