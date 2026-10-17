import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function Index() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#090d16",
        color: "#f8fafc",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily:
          '-apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", Roboto, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: 560,
          width: "100%",
          background: "#111827",
          border: "1px solid #1e293b",
          borderRadius: 18,
          padding: "36px 32px",
          boxShadow: "0 24px 48px rgba(0, 0, 0, 0.35)",
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "4px 10px",
            borderRadius: 999,
            background: "rgba(37, 99, 235, 0.18)",
            color: "#60a5fa",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          PicoSEO • Built for Shopify
        </span>
        <h1
          style={{
            margin: "14px 0 8px",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Zero-bloat SEO, JSON-LD Schema, IndexNow & /llms.txt AI Feed
        </h1>
        <p
          style={{
            margin: "0 0 24px",
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "#94a3b8",
          }}
        >
          1-click bulk metadata and alt-text optimization, zero-JavaScript Liquid
          structured data, real-time IndexNow search engine pings, and an automated
          /llms.txt catalog feed for ChatGPT and Perplexity visibility.
        </p>

        {showForm && (
          <Form method="post" action="/auth/login">
            <label
              htmlFor="shop"
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "#cbd5e1",
                marginBottom: 6,
              }}
            >
              Shop domain
            </label>
            <div style={{ display: "flex", gap: 10 }}>
              <input
                id="shop"
                type="text"
                name="shop"
                placeholder="your-store.myshopify.com"
                required
                style={{
                  flex: 1,
                  padding: "10px 14px",
                  borderRadius: 10,
                  border: "1px solid #334155",
                  background: "#090d16",
                  color: "#f8fafc",
                  fontSize: 14,
                }}
              />
              <button
                type="submit"
                style={{
                  padding: "10px 18px",
                  borderRadius: 10,
                  border: "none",
                  background: "#2563eb",
                  color: "#ffffff",
                  fontSize: 14,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                Launch PicoSEO
              </button>
            </div>
          </Form>
        )}
      </div>
    </div>
  );
}
