import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

export const GOAL_STATUS_KEY = "a4_goal";
export const GOAL_MAX_LENGTH = 500;

const GOAL_SYMBOL_OFF = "🎯";
const GOAL_SYMBOL_ACTIVE = "⭕";

const GOAL_CUSTOM_TYPE = "goal-loop";

let activeGoal: string | null = null;
let isNudging = false;

/** Test seam: reset session-scoped state (vitest isolates modules per test file by default). */
export function _resetGoalLoopForTests(): void {
  activeGoal = null;
  isNudging = false;
}

export function getActiveGoal(): string | null {
  return activeGoal;
}

export function formatGoalNudge(goal: string): string {
  return (
    `[goal-reminder] active goal: "${goal}"\n` +
    `  → cross-check: is this goal genuinely reached? if not, keep working;\n` +
    `  if it is, release to the user. (extension nudge, not user input)`
  );
}

/**
 * Registers the goal-loop feature on the extension API:
 * /focus-goal-start, /focus-goal-start-submit, /focus-goal-end, /focus-goal commands, the footer
 * status indicator, and the agent_end turn-end cross-check nudge. Goal state is session-scoped
 * (module variables, reset on session_start); nothing is persisted to a project setting.
 */
export function registerGoalLoop(pi: ExtensionAPI): void {
  pi.on("session_start", (_event, ctx) => {
    activeGoal = null;
    isNudging = false;
    updateGoalStatus(ctx);
  });

  pi.on("agent_settled", () => {
    // Clear the latch when the run settles while a goal is still active: the
    // injected steer continuation turn has ended and the next turn end may
    // nudge again (v1 has no budget). With no active goal there is nothing to
    // re-arm, and clearing is harmless (session_start clears too).
    isNudging = false;
  });

  function updateGoalStatus(ctx: ExtensionContext): void {
    if (!ctx.hasUI) return;
    ctx.ui.setStatus?.(GOAL_STATUS_KEY, activeGoal ? GOAL_SYMBOL_ACTIVE : GOAL_SYMBOL_OFF);
  }

  function startGoal(definition: string, ctx: ExtensionContext): void {
    activeGoal = definition;
    updateGoalStatus(ctx);
    if (ctx.hasUI) {
      ctx.ui.notify(`Goal started: ${definition}`, "info");
    }
    // Tell the agent the goal is active without starting a turn of its own.
    void pi.sendMessage(
      { customType: GOAL_CUSTOM_TYPE, content: `Goal started by user for this session: ${definition}`, display: true },
      { triggerTurn: false },
    );
  }

  function endGoal(ctx: ExtensionContext): void {
    activeGoal = null;
    updateGoalStatus(ctx);
    if (ctx.hasUI) {
      ctx.ui.notify("Goal ended — turn-end cross-check disarmed.", "info");
    }
  }

  pi.registerCommand("focus-goal-start", {
    description: `Start a session-scoped goal (plain string, max ${GOAL_MAX_LENGTH} chars). The agent cross-checks it at the end of each turn. E.g.: /focus-goal-start "npm test passes"`,
    handler: async (args, ctx) => {
      const definition = (args ?? "").trim();
      if (!definition) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /focus-goal-start <definition> (a plain string of at most 500 characters)", "warning");
        return;
      }
      if (definition.length > GOAL_MAX_LENGTH) {
        if (ctx.hasUI) ctx.ui.notify(`Goal definition is ${definition.length} characters; the maximum is ${GOAL_MAX_LENGTH}. Shorten the goal and retry.`, "error");
        return;
      }
      startGoal(definition, ctx);
    },
  });

  pi.registerCommand("focus-goal-start-submit", {
    description: `Start a session-scoped goal AND immediately submit the definition as a user message, triggering an agent turn that starts working toward the goal ("arm and go"). Same definition rules as /focus-goal-start.`,
    handler: async (args, ctx) => {
      const definition = (args ?? "").trim();
      if (!definition) {
        if (ctx.hasUI) ctx.ui.notify("Usage: /focus-goal-start-submit <definition> (a plain string of at most 500 characters)", "warning");
        return;
      }
      if (definition.length > GOAL_MAX_LENGTH) {
        if (ctx.hasUI) ctx.ui.notify(`Goal definition is ${definition.length} characters; the maximum is ${GOAL_MAX_LENGTH}. Shorten the goal and retry.`, "error");
        return;
      }
      // Arming is identical to /focus-goal-start; only the post-arm submission differs.
      startGoal(definition, ctx);
      // Submit the definition as a user-role message (no template expansion): idle → sent
      // immediately as a new turn; busy → queued as a follow-up so it is not lost.
      if (ctx.isIdle()) {
        await pi.sendUserMessage(definition, { expandPromptTemplates: false });
      } else {
        await pi.sendUserMessage(definition, { deliverAs: "followUp", expandPromptTemplates: false });
      }
    },
  });

  pi.registerCommand("focus-goal-end", {
    description: "End the active goal (disarms the turn-end cross-check; the goal is discarded, not judged).",
    handler: async (_args, ctx) => {
      endGoal(ctx);
    },
  });

  pi.registerCommand("focus-goal", {
    description: "Show the active goal definition, or report that no goal is active.",
    handler: async (_args, ctx) => {
      updateGoalStatus(ctx);
      if (!ctx.hasUI) return;
      if (activeGoal) {
        ctx.ui.notify(`Active goal: ${activeGoal}`, "info");
      } else {
        ctx.ui.notify("No active goal. Start one with /focus-goal-start <definition>.", "info");
      }
    },
  });

  // Turn-end cross-check: when a goal is active and the agent would hand control
  // back, nudge it to cross-check the goal. The nudge is its own turn, so the
  // isNudging latch prevents the injected turn from re-triggering itself;
  // it clears when the settled agent loop ends (agent_settled).
  pi.on("agent_end", async (_event, _ctx) => {
    if (!activeGoal || isNudging) return;
    isNudging = true; // cleared on agent_settled (or session_start) so the steer continuation turn cannot re-nudge
    await pi.sendMessage(
      { customType: GOAL_CUSTOM_TYPE, content: formatGoalNudge(activeGoal), display: true },
      { triggerTurn: true, deliverAs: "steer" },
    );
  });
}
