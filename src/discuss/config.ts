export type DiscussMode = "off" | "block" | "read";

export type ActiveMode = {
  mode: DiscussMode;
  explicit: boolean;
};

export type EffectivePolicy =
  | { enforce: false; mode: "off" }
  | { enforce: true; mode: Exclude<DiscussMode, "off"> };

export function getEffectivePolicy(activeMode: ActiveMode): EffectivePolicy {
  return activeMode.mode === "off"
    ? { enforce: false, mode: "off" }
    : { enforce: true, mode: activeMode.mode };
}