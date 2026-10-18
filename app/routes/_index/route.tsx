import type { LoaderFunctionArgs } from "@remix-run/node";
import { redirect } from "@remix-run/node";
import { Form, useLoaderData } from "@remix-run/react";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  const hasEmbeddedParam =
    url.searchParams.has("shop") ||
    url.searchParams.has("host") ||
    url.searchParams.has("embedded") ||
    url.searchParams.has("id_token") ||
    url.searchParams.has("session") ||
    url.searchParams.has("hmac");

  if (hasEmbeddedParam) {
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
        background: "#f6f6f7",
        color: "#202223",
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
          background: "#ffffff",
          border: "1px solid #e3e3e3",
          borderRadius: 12,
          padding: "36px 32px",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.08)",
        }}
      >
        <span
          style={{
            display: "inline-block",
            padding: "4px 10px",
            borderRadius: 999,
            background: "#f2f7fe",
            color: "#1f5199",
            fontSize: 12,
            fontWeight: 600,
          }}
        >
          PicoSEO
        </span>
        <h1
          style={{
            margin: "14px 0 8px",
            fontSize: 28,
            fontWeight: 700,
            letterSpacing: "-0.02em",
          }}
        >
          Open PicoSEO from Shopify Admin
        </h1>
        <p
          style={{
            margin: "0 0 24px",
            fontSize: 14.5,
            lineHeight: 1.6,
            color: "#6d7175",
          }}
        >
          Merchants install and open this app from the Shopify admin. The form
          below is only for local development with the Shopify CLI. It is not
          the App Store install path.
        </p>

        {showForm && (
          <Form method="post" action="/auth/login">
            <label
              htmlFor="shop"
              style={{
                display: "block",
                fontSize: 12.5,
                fontWeight: 600,
                color: "#202223",
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
                  border: "1px solid #c9cccf",
                  background: "#ffffff",
                  color: "#202223",
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
