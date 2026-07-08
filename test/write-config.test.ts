import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getEffectivePolicy, parseFlagAllowedDirs, parseDirsArgList, loadProjectAllowedDirs } from "../src/write/config.js";
import { promises as fs } from "node:fs";
import * as path from "node:path";

function saveEnv(key: string): string | undefined {
	return process.env[key];
}

function setEnv(key: string, value: string): void {
	process.env[key] = value;
}

function unsetEnv(key: string): void {
	delete process.env[key];
}

describe("write parseFlagAllowedDirs", () => {
	it("parses comma-separated dirs", () => {
		expect(parseFlagAllowedDirs("./docs,./openspec")).toEqual(["./docs", "./openspec"]);
	});

	it("trims whitespace around dirs", () => {
		expect(parseFlagAllowedDirs(" ./docs , ./openspec ")).toEqual(["./docs", "./openspec"]);
	});

	it("returns empty array for empty string", () => {
		expect(parseFlagAllowedDirs("")).toEqual([]);
	});

	it("returns null for non-string input", () => {
		expect(parseFlagAllowedDirs(123 as any)).toBeNull();
		expect(parseFlagAllowedDirs(null as any)).toBeNull();
		expect(parseFlagAllowedDirs(undefined as any)).toBeNull();
	});
});

describe("write parseDirsArgList", () => {
	it("splits on commas and whitespace", () => {
		expect(parseDirsArgList("docs,openspec lib")).toEqual(["docs", "openspec", "lib"]);
	});

	it("handles mixed separators", () => {
		expect(parseDirsArgList("docs , openspec   lib")).toEqual(["docs", "openspec", "lib"]);
	});
});

describe("write getEffectivePolicy - PI_WRITE_GUARD_DIRS", () => {
	const FAKE_CWD = "/fake-project";
	let saved: string | undefined;

	beforeEach(() => {
		saved = saveEnv("PI_WRITE_GUARD_DIRS");
	});

	afterEach(() => {
		if (saved === undefined) {
			unsetEnv("PI_WRITE_GUARD_DIRS");
		} else {
			setEnv("PI_WRITE_GUARD_DIRS", saved);
		}
	});

	it("uses env var when set", async () => {
		setEnv("PI_WRITE_GUARD_DIRS", "./src,./test");
		const policy = await getEffectivePolicy(undefined, null, FAKE_CWD);
		expect(policy.enforce).toBe(true);
		expect(policy.source).toBe("env");
		expect(policy.dirs).toEqual(["./src", "./test"]);
	});

	it("enforces empty allowlist when env var is empty string", async () => {
		setEnv("PI_WRITE_GUARD_DIRS", "");
		const policy = await getEffectivePolicy(undefined, null, FAKE_CWD);
		expect(policy.enforce).toBe(true);
		expect(policy.source).toBe("env");
		expect(policy.dirs).toEqual([]);
	});

	it("falls through to settings when env var is unset", async () => {
		unsetEnv("PI_WRITE_GUARD_DIRS");
		const policy = await getEffectivePolicy(undefined, null, FAKE_CWD);
		expect(policy.enforce).toBe(false);
		expect(policy.source).toBe("none");
	});

	it("CLI flag takes priority over env var when no session override", async () => {
		setEnv("PI_WRITE_GUARD_DIRS", "./env-dir");
		const policy = await getEffectivePolicy("./flag-dir", null, FAKE_CWD);
		expect(policy.enforce).toBe(true);
		expect(policy.source).toBe("flag");
		expect(policy.dirs).toEqual(["./flag-dir"]);
	});

	it("session override takes priority over CLI flag", async () => {
		const policy = await getEffectivePolicy("./flag-dir", { mode: "allow", dirs: ["./session-dir"] }, FAKE_CWD);
		expect(policy.enforce).toBe(true);
		expect(policy.source).toBe("session");
		expect(policy.dirs).toEqual(["./session-dir"]);
	});

	it("session off takes priority over CLI flag", async () => {
		const policy = await getEffectivePolicy("./flag-dir", { mode: "off" }, FAKE_CWD);
		expect(policy.enforce).toBe(false);
		expect(policy.source).toBe("session(off)");
	});

	it("session override takes priority over env var", async () => {
		setEnv("PI_WRITE_GUARD_DIRS", "./env-dir");
		const policy = await getEffectivePolicy(undefined, { mode: "allow", dirs: ["./session-dir"] }, FAKE_CWD);
		expect(policy.enforce).toBe(true);
		expect(policy.source).toBe("session");
		expect(policy.dirs).toEqual(["./session-dir"]);
	});

	it("session off takes priority over env var", async () => {
		setEnv("PI_WRITE_GUARD_DIRS", "./env-dir");
		const policy = await getEffectivePolicy(undefined, { mode: "off" }, FAKE_CWD);
		expect(policy.enforce).toBe(false);
		expect(policy.source).toBe("session(off)");
	});

	it("no session override falls back to env var", async () => {
		setEnv("PI_WRITE_GUARD_DIRS", "./env-dir");
		const policy = await getEffectivePolicy(undefined, null, FAKE_CWD);
		expect(policy.enforce).toBe(true);
		expect(policy.source).toBe("env");
		expect(policy.dirs).toEqual(["./env-dir"]);
	});
});

describe("write loadProjectAllowedDirs", () => {
	let tmpDir: string;

	beforeEach(async () => {
		tmpDir = await fs.mkdtemp(path.join("/tmp", "pi-focus-write-guard-test-"));
	});

	afterEach(async () => {
		try {
			await fs.rm(tmpDir, { recursive: true, force: true });
		}
		catch {
			// ignore
		}
	});

	it("reads piWriteGuard.allowedDirs", async () => {
		const settings = path.join(tmpDir, ".pi", "settings.json");
		await fs.mkdir(path.dirname(settings), { recursive: true });
		await fs.writeFile(settings, JSON.stringify({ piWriteGuard: { allowedDirs: ["./lib", "./test"] } }));

		const result = await loadProjectAllowedDirs(tmpDir);
		expect(result).toEqual(["./lib", "./test"]);
	});

	it("prefers piWriteGuard over writePolicy", async () => {
		const settings = path.join(tmpDir, ".pi", "settings.json");
		await fs.mkdir(path.dirname(settings), { recursive: true });
		await fs.writeFile(settings, JSON.stringify({
			piWriteGuard: { allowedDirs: ["./new"] },
			writePolicy: { allowedDirs: ["./old"] },
		}));

		const result = await loadProjectAllowedDirs(tmpDir);
		expect(result).toEqual(["./new"]);
	});

	it("falls back to writePolicy when piWriteGuard is absent", async () => {
		const settings = path.join(tmpDir, ".pi", "settings.json");
		await fs.mkdir(path.dirname(settings), { recursive: true });
		await fs.writeFile(settings, JSON.stringify({
			writePolicy: { allowedDirs: ["./legacy"] },
		}));

		const result = await loadProjectAllowedDirs(tmpDir);
		expect(result).toEqual(["./legacy"]);
	});

	it("falls back to writeAllowDirs when both nested keys are absent", async () => {
		const settings = path.join(tmpDir, ".pi", "settings.json");
		await fs.mkdir(path.dirname(settings), { recursive: true });
		await fs.writeFile(settings, JSON.stringify({ writeAllowDirs: ["./flat"] }));

		const result = await loadProjectAllowedDirs(tmpDir);
		expect(result).toEqual(["./flat"]);
	});

	it("returns null when no config keys present", async () => {
		const settings = path.join(tmpDir, ".pi", "settings.json");
		await fs.mkdir(path.dirname(settings), { recursive: true });
		await fs.writeFile(settings, JSON.stringify({ foo: "bar" }));

		const result = await loadProjectAllowedDirs(tmpDir);
		expect(result).toBeNull();
	});

	it("returns null when .pi/settings.json does not exist", async () => {
		const result = await loadProjectAllowedDirs(tmpDir);
		expect(result).toBeNull();
	});
});
