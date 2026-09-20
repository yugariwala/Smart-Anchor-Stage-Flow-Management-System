import { describe, expect, it } from "vitest";

import { translate } from "../src/lib/i18n";

describe("interface translations", () => {
  it("translates page copy in Hindi and Gujarati", () => {
    expect(translate("hi", "Your events")).toBe("आपके कार्यक्रम");
    expect(
      translate(
        "gu",
        "Build your agenda and define the commitments your schedule must protect.",
      ),
    ).toBe(
      "તમારી કાર્યસૂચિ બનાવો અને શેડ્યૂલને સુરક્ષિત રાખવાની પ્રતિબદ્ધતાઓ નક્કી કરો.",
    );
  });

  it("interpolates dynamic values and falls back to English", () => {
    expect(translate("hi", "Revision {revision}", { revision: 7 })).toBe(
      "संशोधन 7",
    );
    expect(translate("gu", "User-authored event title")).toBe(
      "User-authored event title",
    );
  });
});
