import assert from "node:assert/strict";
import type { DockerMount } from "../docker/dockerClient";
import {
    HostPathNotFoundError,
    OutsideBindMountError,
    UnsupportedMountSourceError,
    VolumeMountError,
    assertWindowsPathExists,
    resolveWindowsPath,
} from "../resolver/mountResolver";

/**
 * Creates a concise inspect mount for resolver tests.
 */
function mount(Type: string, Source: string, Destination: string): DockerMount {
    return { Type, Source, Destination };
}

suite("mountResolver", () => {
    test("resolves a native Windows bind mount", () => {
        const result = resolveWindowsPath(
            "/workspaces/sample/src/index.ts",
            [mount("bind", "C:\\Users\\Leo\\sample", "/workspaces/sample")],
        );

        assert.equal(result, "C:\\Users\\Leo\\sample\\src\\index.ts");
    });

    test("preserves spaces in paths", () => {
        const result = resolveWindowsPath(
            "/workspaces/my project/docs/read me.md",
            [mount("bind", "C:\\Users\\Leo Faucon\\my project", "/workspaces/my project")],
        );

        assert.equal(result, "C:\\Users\\Leo Faucon\\my project\\docs\\read me.md");
    });

    test("does not cross a destination segment boundary", () => {
        assert.throws(
            () =>
                resolveWindowsPath(
                    "/workspace-other/file.txt",
                    [mount("bind", "C:\\workspace", "/workspace")],
                ),
            OutsideBindMountError,
        );
    });

    test("chooses the longest nested mount", () => {
        const result = resolveWindowsPath(
            "/workspace/generated/output.txt",
            [
                mount("bind", "C:\\project", "/workspace"),
                mount("bind", "D:\\generated", "/workspace/generated"),
            ],
        );

        assert.equal(result, "D:\\generated\\output.txt");
    });

    test("supports Docker Desktop host_mnt sources on another drive", () => {
        const result = resolveWindowsPath(
            "/workspace/lib/file.ts",
            [mount("bind", "/host_mnt/d/Projects/sample", "/workspace")],
        );

        assert.equal(result, "D:\\Projects\\sample\\lib\\file.ts");
    });

    test("supports Docker Desktop run desktop sources", () => {
        const result = resolveWindowsPath(
            "/workspace/file.ts",
            [mount("bind", "/run/desktop/mnt/host/c/Projects/sample", "/workspace")],
        );

        assert.equal(result, "C:\\Projects\\sample\\file.ts");
    });

    test("rejects a Docker volume", () => {
        assert.throws(
            () =>
                resolveWindowsPath(
                    "/workspace/data.db",
                    [mount("volume", "sample-data", "/workspace")],
                ),
            VolumeMountError,
        );
    });

    test("does not fall through a nested volume to a parent bind", () => {
        assert.throws(
            () =>
                resolveWindowsPath(
                    "/workspace/data/cache.db",
                    [
                        mount("bind", "C:\\project", "/workspace"),
                        mount("volume", "cache-data", "/workspace/data"),
                    ],
                ),
            VolumeMountError,
        );
    });

    test("rejects an unsupported bind source", () => {
        assert.throws(
            () =>
                resolveWindowsPath(
                    "/workspace/file.ts",
                    [mount("bind", "/home/leo/project", "/workspace")],
                ),
            UnsupportedMountSourceError,
        );
    });

    test("reports a missing host path", () => {
        assert.throws(
            () => assertWindowsPathExists("C:\\missing\\file.ts", () => false),
            HostPathNotFoundError,
        );
    });
});
