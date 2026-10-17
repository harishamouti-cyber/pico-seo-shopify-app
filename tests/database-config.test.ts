import { afterEach, describe, expect, it, vi } from "vitest";

const client = vi.hoisted(() => vi.fn());
vi.mock("@prisma/client", () => ({ PrismaClient: client }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.clearAllMocks();
});

describe("database configuration", () => {
  it("does not replace the configured PostgreSQL URL on Vercel", async () => {
    const url = "postgresql://test@localhost:5432/picoseo";
    vi.stubEnv("DATABASE_URL", url);
    vi.stubEnv("VERCEL", "1");
    await import("../app/db.server");
    expect(process.env.DATABASE_URL).toBe(url);
  });

  it.each([undefined, "", "file:/tmp/dev.sqlite"])("rejects missing or ephemeral storage: %s", async (url) => {
    vi.stubEnv("DATABASE_URL", url);
    await expect(import("../app/db.server")).rejects.toThrow("Set DATABASE_URL to a PostgreSQL connection string");
    expect(client).not.toHaveBeenCalled();
    expect(process.env.DATABASE_URL).toBe(url);
  });

  it("never includes a rejected connection string in its error", async () => {
    vi.stubEnv("DATABASE_URL", "mysql://user:private-password@host/db");
    await expect(import("../app/db.server")).rejects.not.toThrow("private-password");
  });
});
