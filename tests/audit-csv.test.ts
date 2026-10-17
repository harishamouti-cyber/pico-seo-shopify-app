import { describe, expect, it } from "vitest";
import { buildAuditCsv } from "../app/lib/audit-csv";
import type { AuditedProduct } from "../app/lib/types";

function product(title: string): AuditedProduct {
  return {
    id: "gid://shopify/Product/1", title, handle: "test", status: "ACTIVE", vendor: "Pico",
    seoTitle: "Custom SEO title", seoDescription: "First line\nSecond line",
    audit: { score: 75, missingAltCount: 1, issues: [{ key: "alt", label: "Missing alt text", tone: "critical" }] },
  } as AuditedProduct;
}

describe("audit CSV export", () => {
  it("escapes quotes, commas, newlines and keeps audit information", () => {
    const csv = buildAuditCsv([product('A "great", product')]);
    expect(csv).toContain('"A ""great"", product"');
    expect(csv).toContain('"First line\nSecond line"');
    expect(csv).toContain('"75","Custom SEO title"');
    expect(csv).toContain('"1","Missing alt text"');
    expect(csv.split("\r\n")).toHaveLength(2);
  });

  it.each(["=HYPERLINK(\"https://evil.test\")", "+SUM(1,2)", "-1+1", "@SUM(1)", "  =1+1", "\t=1+1"])(
    "neutralizes spreadsheet formulas: %s", (title) => {
      expect(buildAuditCsv([product(title)])).toContain(`"'${title.replace(/"/g, '""')}"`);
    },
  );

  it("exports no extra products and handles an empty selection", () => {
    const csv = buildAuditCsv([]);
    expect(csv).toContain('"Product ID"');
    expect(csv).not.toContain("\r\n");
  });
});
