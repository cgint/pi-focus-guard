import { promises as fs } from "node:fs";
import * as path from "node:path";
import { resolveMaybeRelative, realpathIfExists } from "./path-utils.js";

export type SettingsShape = {
	writeAllowDirs?: unknown;
	writePolicy?: {
		allowedDirs?: unknown;
	};
	piWriteGuard?: {
		allowedDirs?: unknown;
	};
	piWritePermit?: {
		allowedDirs?: unknown;
	};
};

export type NonEmptyDirs = [string, ...string[]];

type ConfigSource = "flag" | "env" | "session" | "settings" | "command";

export class WriteGuardConfigError extends Error {
	constructor(source: ConfigSource, detail = "must name at least one directory. Give at least one directory, or use read-only discuss mode if you intend to forbid all writes.") {
		super(`Write guard configuration is invalid: ${source === "flag" ? "--write-guard" : source === "env" ? "PI_WRITE_GUARD_DIRS" : source === "settings" ? ".pi/settings.json" : source === "command" ? "/focus-write-guard" : "the session override"} ${detail}`);
		this.name = "WriteGuardConfigError";
	}
}

export function requireNonEmptyDirs(dirs: string[], source: ConfigSource): NonEmptyDirs {
	if (dirs.length === 0) throw new WriteGuardConfigError(source);
	return dirs as NonEmptyDirs;
}

export type SessionOverride =
	| { mode: "allow"; dirs: NonEmptyDirs }
	| { mode: "off" };

export async function loadProjectAllowedDirs(projectCwd: string): Promise<NonEmptyDirs | null> {
	const settingsPath = path.join(projectCwd, ".pi", "settings.json");
	let raw: string;
	try {
		raw = await fs.readFile(settingsPath, "utf-8");
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
		throw new WriteGuardConfigError("settings", "cannot be read. Fix or remove the invalid configuration.");
	}

	let json: SettingsShape;
	try {
		json = JSON.parse(raw) as SettingsShape;
	} catch {
		throw new WriteGuardConfigError("settings", "contains malformed JSON. Fix or remove the invalid configuration.");
	}
	const candidate =
		json.piWriteGuard && typeof json.piWriteGuard === "object" && "allowedDirs" in json.piWriteGuard ? json.piWriteGuard.allowedDirs :
		json.piWritePermit && typeof json.piWritePermit === "object" && "allowedDirs" in json.piWritePermit ? json.piWritePermit.allowedDirs :
		json.writePolicy && typeof json.writePolicy === "object" && "allowedDirs" in json.writePolicy ? json.writePolicy.allowedDirs :
		"writeAllowDirs" in json ? json.writeAllowDirs : undefined;
	if (candidate === undefined) return null;
	if (!Array.isArray(candidate) || !candidate.every((v) => typeof v === "string")) {
		throw new WriteGuardConfigError("settings", "must contain an allowedDirs array of strings.");
	}
	return requireNonEmptyDirs(candidate, "settings");
}

export function parseFlagAllowedDirs(flagValue: unknown): NonEmptyDirs | null {
	if (typeof flagValue !== "string") return null;
	return requireNonEmptyDirs(flagValue.trim().split(",").map((s) => s.trim()).filter(Boolean), "flag");
}

export function parseDirsArgList(args: string): string[] {
	return args.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

export function formatResolvedList(resolvedDirs: string[]): string {
	return resolvedDirs.length > 0 ? resolvedDirs.map((d) => `- ${d}`).join("\n") : "(none)";
}

export type EffectivePolicy =
	| { enforce: false; source: "none" | "session(off)"; dirs: null }
	| { enforce: true; source: "flag" | "env" | "session" | "settings"; dirs: NonEmptyDirs };

export async function getEffectivePolicy(
	flagValue: unknown,
	sessionOverride: SessionOverride | null,
	cwd: string,
): Promise<EffectivePolicy> {
	const flagDirs = parseFlagAllowedDirs(flagValue);
	const envValue = process.env.PI_WRITE_GUARD_DIRS;
	const envDirs = envValue === undefined ? null : requireNonEmptyDirs(envValue.trim().split(",").map((s) => s.trim()).filter(Boolean), "env");
	const settingsDirs = await loadProjectAllowedDirs(cwd);

	if (sessionOverride?.mode === "off") {
		return { enforce: false, source: "session(off)", dirs: null };
	}
	if (sessionOverride?.mode === "allow") {
		return { enforce: true, source: "session", dirs: requireNonEmptyDirs(sessionOverride.dirs, "session") };
	}
	if (flagDirs !== null) {
		return { enforce: true, source: "flag", dirs: flagDirs };
	}
	if (envDirs !== null) {
		return { enforce: true, source: "env", dirs: envDirs };
	}


	if (settingsDirs !== null) {
		return { enforce: true, source: "settings", dirs: requireNonEmptyDirs(settingsDirs, "settings") };
	}

	return { enforce: false, source: "none", dirs: null };
}

export async function resolveAllowedDirs(dirs: string[], cwd: string): Promise<string[]> {
	return Promise.all(dirs.map(async (d) => realpathIfExists(resolveMaybeRelative(d, cwd))));
}
