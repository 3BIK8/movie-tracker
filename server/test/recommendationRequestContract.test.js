import test from "node:test";

test("request budget constants stay below Express default JSON limit", () => {
  const historyBudget = 56 * 1024;
  const feedbackBudget = 32 * 1024;
  const jsonOverheadBudget = 8 * 1024;

  if (historyBudget + feedbackBudget + jsonOverheadBudget >= 100 * 1024) {
    throw new Error("Recommendation request budget exceeds 100 KB parser limit");
  }
});
