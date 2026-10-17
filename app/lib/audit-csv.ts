import type { AuditedProduct } from "./types";

function csvCell(value: string | number): string {
  let text = String(value);
  // Quoting alone does not stop spreadsheet formula injection.
  if (/^[\s]*[=+\-@]|^[\t\r\n]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

/** Export exactly the currently displayed audit, not an unaudited full catalog. */
export function buildAuditCsv(products: AuditedProduct[]): string {
  const rows: Array<Array<string | number>> = [
    ["Product ID", "Title", "Handle", "Status", "Vendor", "SEO score", "SEO title", "Meta description", "Missing alt texts", "Issues"],
    ...products.map((product) => [
      product.id,
      product.title,
      product.handle,
      product.status,
      product.vendor,
      product.audit.score,
      product.seoTitle || "",
      product.seoDescription || "",
      product.audit.missingAltCount,
      product.audit.issues.map((issue) => issue.label).join("; "),
    ]),
  ];
  return rows.map((row) => row.map(csvCell).join(",")).join("\r\n");
}
