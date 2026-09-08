import assert from "node:assert/strict";
import type { DockerContainer } from "../docker/dockerClient";
import {
    AmbiguousContainerError,
    ContainerNotFoundError,
    extractHostPath,
    locateDevContainer,
} from "../resolver/containerLocator";

/**
 * Builds the remote authority used by Dev Containers.
 */
function authority(hostPath: string, asJson = true): string {
    const payload = asJson ? JSON.stringify({ hostPath, localDocker: true }) : hostPath;
    return `dev-container+${Buffer.from(payload, "utf8").toString("hex")}`;
}

/**
 * Creates the inspect subset consumed by the container locator.
 */
function container(
    name: string,
    hostPath: string,
    hostname = name,
    idCharacter = "a",
): DockerContainer {
    return {
        Id: idCharacter.repeat(64),
        Name: `/${name}`,
        Config: {
            Hostname: hostname,
            Labels: {
                "devcontainer.local_folder": hostPath,
                "devcontainer.config_file": `${hostPath}\\.devcontainer\\devcontainer.json`,
            },
        },
        Mounts: [],
    };
}

suite("containerLocator", () => {
    test("extracts hostPath from a JSON authority", () => {
        assert.equal(
            extractHostPath(authority("C:\\Projects\\sample")),
            "C:\\Projects\\sample",
        );
    });

    test("extracts a legacy plain-path authority", () => {
        assert.equal(
            extractHostPath(authority("C:\\Projects\\legacy", false)),
            "C:\\Projects\\legacy",
        );
    });

    test("matches the Dev Container local folder label", () => {
        const expected = container("sample", "C:\\Projects\\sample", "abc", "a");
        const other = container("other", "D:\\Projects\\other", "def", "b");

        assert.equal(
            locateDevContainer([other, expected], {
                remoteAuthority: authority("c:/projects/sample/"),
            }),
            expected,
        );
    });

    test("uses the hostname to disambiguate duplicate folder labels", () => {
        const expected = container("current", "C:\\Projects\\sample", "abc123", "a");
        const duplicate = container("duplicate", "C:\\Projects\\sample", "def456", "b");

        assert.equal(
            locateDevContainer([duplicate, expected], {
                remoteAuthority: authority("C:\\Projects\\sample"),
                remoteHostname: "abc123",
            }),
            expected,
        );
    });

    test("matches a container by its short ID hostname", () => {
        const expected = container("current", "C:\\Projects\\sample", "custom", "c");

        assert.equal(
            locateDevContainer([expected], {
                remoteAuthority: "dev-container+invalid",
                remoteHostname: "cccccccccccc",
            }),
            expected,
        );
    });

    test("rejects ambiguous containers", () => {
        const first = container("first", "C:\\Projects\\sample", "same", "a");
        const second = container("second", "C:\\Projects\\sample", "same", "b");

        assert.throws(
            () =>
                locateDevContainer([first, second], {
                    remoteAuthority: authority("C:\\Projects\\sample"),
                    remoteHostname: "same",
                }),
            AmbiguousContainerError,
        );
    });

    test("rejects a unique but non-matching container", () => {
        const unrelated = container("other", "D:\\Projects\\other");

        assert.throws(
            () =>
                locateDevContainer([unrelated], {
                    remoteAuthority: authority("C:\\Projects\\sample"),
                }),
            ContainerNotFoundError,
        );
    });

    test("accepts the sole labeled container when no signal is available", () => {
        const expected = container("sample", "C:\\Projects\\sample");

        assert.equal(
            locateDevContainer([expected], {
                remoteAuthority: "dev-container+invalid",
            }),
            expected,
        );
    });

    test("ignores ordinary Docker containers without Dev Container labels", () => {
        const ordinary: DockerContainer = {
            Id: "f".repeat(64),
            Name: "/database",
            Config: {
                Hostname: "database",
                Labels: {},
            },
            Mounts: [],
        };

        assert.throws(
            () =>
                locateDevContainer([ordinary], {
                    remoteAuthority: "dev-container+invalid",
                }),
            ContainerNotFoundError,
        );
    });
});
