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

export type SessionOverride =
	| { mode: "allow"; dirs: string[] }
	| { mode: "off" };

export async function loadProjectAllowedDirs(projectCwd: string): Promise<string[] | null> {
	const settingsPath = path.join(projectCwd, ".pi", "settings.json");
	try {
		const raw = await fs.readFile(settingsPath, "utf-8");
		const json = JSON.parse(raw) as SettingsShape;
		const candidate =
			json.piWriteGuard && typeof json.piWriteGuard === "object" ? json.piWriteGuard.allowedDirs :
			json.piWritePermit && typeof json.piWritePermit === "object" ? json.piWritePermit.allowedDirs :
			json.writePolicy && typeof json.writePolicy === "object" ? json.writePolicy.allowedDirs :
			json.writeAllowDirs;
		if (!candidate) return null;
		if (!Array.isArray(candidate)) return null;
		return candidate.filter((v): v is string => typeof v === "string");
	} catch {
		return null;
	}
}

export function parseFlagAllowedDirs(flagValue: unknown): string[] | null {
	if (typeof flagValue !== "string") return null;
	const trimmed = flagValue.trim();
	if (!trimmed) return [];
	return trimmed.split(",").map((s) => s.trim()).filter(Boolean);
}

export function parseDirsArgList(args: string): string[] {
	return args.split(/[\s,]+/).map((s) => s.trim()).filter(Boolean);
}

export function formatResolvedList(resolvedDirs: string[]): string {
	return resolvedDirs.length > 0 ? resolvedDirs.map((d) => `- ${d}`).join("\n") : "(none)";
}

export type EffectivePolicy =
	| { enforce: false; source: "none" | "session(off)"; dirs: null }
	| { enforce: true; source: "flag" | "env" | "session" | "settings"; dirs: string[] };

export async function getEffectivePolicy(
	flagValue: unknown,
	sessionOverride: SessionOverride | null,
	cwd: string,
): Promise<EffectivePolicy> {
	const flagDirs = parseFlagAllowedDirs(flagValue);
	if (sessionOverride?.mode === "off") {
		return { enforce: false, source: "session(off)", dirs: null };
	}
	if (sessionOverride?.mode === "allow") {
		return { enforce: true, source: "session", dirs: sessionOverride.dirs };
	}

	if (flagDirs !== null) {
		return { enforce: true, source: "flag", dirs: flagDirs };
	}

	const envValue = process.env.PI_WRITE_GUARD_DIRS;
	if (envValue !== undefined) {
		return { enforce: true, source: "env", dirs: envValue.trim().split(",").map((s) => s.trim()).filter(Boolean) };
	}

	const settingsDirs = await loadProjectAllowedDirs(cwd);
	if (settingsDirs !== null) {
		return { enforce: true, source: "settings", dirs: settingsDirs };
	}

	return { enforce: false, source: "none", dirs: null };
}

export async function resolveAllowedDirs(dirs: string[], cwd: string): Promise<string[]> {
	return Promise.all(dirs.map(async (d) => realpathIfExists(resolveMaybeRelative(d, cwd))));
}
