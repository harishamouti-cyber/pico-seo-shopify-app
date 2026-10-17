import { describe, expect, it, vi } from "vitest";
import { gql, ShopifyGraphqlError } from "../app/services/graphql.server";

describe("Shopify GraphQL response handling", () => {
  it.each([302, 401])("preserves thrown %i responses and their auth headers", async (status) => {
    const response = new Response(null, {
      status,
      headers: { "X-Shopify-Retry-Invalid-Session-Request": "1", Location: "/auth/session-token" },
    });
    const admin = { graphql: vi.fn().mockRejectedValue(response) };
    await expect(gql(admin, "query Test { shop { id } }")).rejects.toBe(response);
  });

  it("preserves a returned 401 before trying to decode its empty body", async () => {
    const response = new Response(null, { status: 401 });
    await expect(gql({ graphql: vi.fn().mockResolvedValue(response) }, "query")).rejects.toBe(response);
  });

  it("does not treat partial GraphQL data with errors as success", async () => {
    const response = Response.json({
      data: { products: null },
      errors: [{ message: "Access denied" }],
    });
    await expect(gql({ graphql: vi.fn().mockResolvedValue(response) }, "query"))
      .rejects.toThrow("Access denied");
  });

  it("wraps SDK query errors with their details", async () => {
    const error = Object.assign(new Error("Throttled"), { body: { errors: ["rate limit"] } });
    const result = gql({ graphql: vi.fn().mockRejectedValue(error) }, "query");
    await expect(result).rejects.toBeInstanceOf(ShopifyGraphqlError);
    await expect(result).rejects.toMatchObject({ details: ["rate limit"] });
  });

  it("passes variables and returns successful data", async () => {
    const graphql = vi.fn().mockResolvedValue(Response.json({ data: { shop: { name: "Test" } } }));
    await expect(gql({ graphql }, "query", { first: 50 })).resolves.toEqual({ shop: { name: "Test" } });
    expect(graphql).toHaveBeenCalledWith("query", { variables: { first: 50 } });
  });
});
