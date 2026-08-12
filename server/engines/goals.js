// ---------------------------------------------------------------------------
// goals.js — multi-goal feasibility via Monte Carlo.
//
// The implementation now lives in shared/goals.mjs so the public static site can
// run the identical simulation in the browser. This file stays as the server's
// import path; there is exactly one copy of the logic.
// ---------------------------------------------------------------------------
export { ASSETS, simulateGoal, requiredSip, recommendedAlloc, rebalancePrompt } from "../../shared/goals.mjs";
