import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { getEffectivePolicy, parseFlagAllowedDirs, parseDirsArgList, loadProjectAllowedDirs, WriteGuardConfigError } from "../src/write/config.js";
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

	it("throws a configuration error for an empty string", () => {
		expect(() => parseFlagAllowedDirs("")).toThrow(WriteGuardConfigError);
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

	it("throws a configuration error when env var is an empty string", async () => {
		setEnv("PI_WRITE_GUARD_DIRS", "");
		await expect(getEffectivePolicy(undefined, null, FAKE_CWD)).rejects.toThrow(WriteGuardConfigError);
	});

	it("falls through to settings when env var is unset", async () => {
		unsetEnv("PI_WRITE_GUARD_DIRS");
		const policy = await getEffectivePolicy(undefined, null, FAKE_CWD);
		expect(policy.enforce).toBe(false);
		expect(policy.source).toBe("none");
	});

	it("rejects an empty env allowlist beneath a valid flag", async () => {
		setEnv("PI_WRITE_GUARD_DIRS", "");
		await expect(getEffectivePolicy("./flag-dir", null, FAKE_CWD)).rejects.toThrow(WriteGuardConfigError);
	});

	it("rejects an empty flag beneath a session-off override", async () => {
		await expect(getEffectivePolicy("", { mode: "off" }, FAKE_CWD)).rejects.toThrow(WriteGuardConfigError);
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

	it("throws a configuration error when allowedDirs is empty", async () => {
		const saved = saveEnv("PI_WRITE_GUARD_DIRS");
		unsetEnv("PI_WRITE_GUARD_DIRS");
		try {
			const settings = path.join(tmpDir, ".pi", "settings.json");
			await fs.mkdir(path.dirname(settings), { recursive: true });
			await fs.writeFile(settings, JSON.stringify({ piWriteGuard: { allowedDirs: [] } }));

			await expect(getEffectivePolicy(undefined, null, tmpDir)).rejects.toThrow(WriteGuardConfigError);
		} finally {
			if (saved === undefined) unsetEnv("PI_WRITE_GUARD_DIRS");
			else setEnv("PI_WRITE_GUARD_DIRS", saved);
		}
	});

	it("rejects an empty settings allowlist beneath a session-off override", async () => {
		const saved = saveEnv("PI_WRITE_GUARD_DIRS");
		unsetEnv("PI_WRITE_GUARD_DIRS");
		try {
			const settings = path.join(tmpDir, ".pi", "settings.json");
			await fs.mkdir(path.dirname(settings), { recursive: true });
			await fs.writeFile(settings, JSON.stringify({ piWriteGuard: { allowedDirs: [] } }));

			await expect(getEffectivePolicy(undefined, { mode: "off" }, tmpDir)).rejects.toThrow(WriteGuardConfigError);
		} finally {
			if (saved === undefined) unsetEnv("PI_WRITE_GUARD_DIRS");
			else setEnv("PI_WRITE_GUARD_DIRS", saved);
		}
	});

	it("throws a configuration error when settings cannot be read", async () => {
		const settings = path.join(tmpDir, ".pi", "settings.json");
		await fs.mkdir(settings, { recursive: true });

		await expect(loadProjectAllowedDirs(tmpDir)).rejects.toThrow(WriteGuardConfigError);
	});

	it("throws a configuration error for malformed settings JSON", async () => {
		const settings = path.join(tmpDir, ".pi", "settings.json");
		await fs.mkdir(path.dirname(settings), { recursive: true });
		await fs.writeFile(settings, "{");

		await expect(loadProjectAllowedDirs(tmpDir)).rejects.toThrow(WriteGuardConfigError);
	});

	it("throws a configuration error for a non-array allowedDirs value", async () => {
		const settings = path.join(tmpDir, ".pi", "settings.json");
		await fs.mkdir(path.dirname(settings), { recursive: true });
		await fs.writeFile(settings, JSON.stringify({ piWriteGuard: { allowedDirs: "docs" } }));

		await expect(loadProjectAllowedDirs(tmpDir)).rejects.toThrow(WriteGuardConfigError);
	});

	it("throws a configuration error when allowedDirs contains a non-string member", async () => {
		const settings = path.join(tmpDir, ".pi", "settings.json");
		await fs.mkdir(path.dirname(settings), { recursive: true });
		await fs.writeFile(settings, JSON.stringify({ piWriteGuard: { allowedDirs: ["./docs", 1] } }));

		await expect(loadProjectAllowedDirs(tmpDir)).rejects.toThrow(WriteGuardConfigError);
	});

	it("throws a configuration error when an explicit list filters to empty", async () => {
		const settings = path.join(tmpDir, ".pi", "settings.json");
		await fs.mkdir(path.dirname(settings), { recursive: true });
		await fs.writeFile(settings, JSON.stringify({ piWriteGuard: { allowedDirs: [1, false] } }));

		await expect(loadProjectAllowedDirs(tmpDir)).rejects.toThrow(WriteGuardConfigError);
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
