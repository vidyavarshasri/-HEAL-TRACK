export type RiskLevel = "stable" | "monitor" | "clinical_review" | "urgent";

export type SymptomInput = {
  painLevel: number;
  swelling: string;
  redness: string;
  discharge: string;
  bleeding: boolean;
  fever: boolean;
  odor: boolean;
  rapidWorsening: boolean;
};

export function assessRiskAwareness(input: SymptomInput): {
  riskLevel: RiskLevel;
  riskReasons: string[];
} {
  const reasons: string[] = [];
  const urgentPattern =
    input.fever &&
    input.rapidWorsening &&
    (input.redness === "moderate" ||
      input.redness === "severe" ||
      input.discharge === "moderate" ||
      input.discharge === "severe" ||
      input.swelling === "moderate" ||
      input.swelling === "severe");

  if (urgentPattern) {
    reasons.push(
      "Fever reported together with rapid worsening and local symptoms.",
    );
    return { riskLevel: "urgent", riskReasons: reasons };
  }

  if (input.fever) reasons.push("Fever reported.");
  if (input.rapidWorsening) reasons.push("Rapid worsening reported.");
  if (input.painLevel >= 8) reasons.push("High pain level reported.");
  if (input.swelling === "severe") reasons.push("Severe swelling reported.");
  if (input.redness === "severe") reasons.push("Severe redness reported.");
  if (input.discharge === "moderate" || input.discharge === "severe") {
    reasons.push("Wound discharge reported.");
  }
  if (input.bleeding) reasons.push("Bleeding reported.");
  if (input.odor) reasons.push("Unusual odor reported.");

  if (reasons.length > 0) {
    return { riskLevel: "clinical_review", riskReasons: reasons };
  }

  const mildChanges =
    input.painLevel > 0 ||
    [input.swelling, input.redness, input.discharge].some(
      (level) => level === "mild" || level === "moderate",
    );

  if (mildChanges) {
    return {
      riskLevel: "monitor",
      riskReasons: ["A symptom change was reported; continue tracking."],
    };
  }

  return {
    riskLevel: "stable",
    riskReasons: ["No warning symptoms were reported in this update."],
  };
}
