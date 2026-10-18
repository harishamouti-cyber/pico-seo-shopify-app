import type { HeadersFunction, LoaderFunctionArgs } from "@remix-run/node";
import {
  isRouteErrorResponse,
  Link,
  Outlet,
  useLoaderData,
  useLocation,
  useRouteError,
} from "@remix-run/react";
import { boundary } from "@shopify/shopify-app-remix/server";
import { AppProvider } from "@shopify/shopify-app-remix/react";
import { NavMenu } from "@shopify/app-bridge-react";
import polarisStyles from "@shopify/polaris/build/esm/styles.css?url";
import picoStyles from "../styles/picoseo-ui.css?url";
import { authRecoveryPath } from "../lib/auth-recovery";
import { authenticate } from "../shopify.server";

export const links = () => [
  { rel: "stylesheet", href: polarisStyles },
  { rel: "stylesheet", href: picoStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return { apiKey: process.env.SHOPIFY_API_KEY || "" };
};

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider isEmbeddedApp apiKey={apiKey}>
      <NavMenu>
        <Link to="/app" rel="home">
          SEO overview
        </Link>
        <Link to="/app/settings">Templates</Link>
        <Link to="/app/simulator">Schema preview</Link>
        <Link to="/app/billing">Billing</Link>
      </NavMenu>
      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  const error = useRouteError();
  const location = useLocation();
  const isAuthError = isRouteErrorResponse(error) && error.status === 401;

  // Keep Shopify's HTML responses intact: they contain App Bridge redirects.
  if (
    isRouteErrorResponse(error) &&
    typeof error.data === "string" &&
    /<script\b/i.test(error.data)
  ) {
    return boundary.error(error);
  }

  if (isAuthError || !isRouteErrorResponse(error) || error.status >= 500) {
    return (
      <main className="pico-shell">
        <section className="pico-bento-card" role="alert" style={{ maxWidth: 560, margin: "64px auto" }}>
          <h1>{isAuthError ? "Reconnect to Shopify" : "The audit could not be loaded"}</h1>
          <p>
            {isAuthError
              ? "Your Shopify session could not be verified. Retry to request a fresh session. Retrying does not change your catalog."
              : "PicoSEO could not complete this request. Retry before making more changes; completed updates may already be saved."}
          </p>
          <a className="pico-btn pico-btn--primary" href={authRecoveryPath(location.pathname, location.search)}>
            {isAuthError ? "Retry Shopify connection" : "Retry request"}
          </a>
          <p>
            If this continues, reopen PicoSEO from Shopify Admin. The app owner
            should check the deployment logs and Shopify credentials.
          </p>
        </section>
      </main>
    );
  }

  return boundary.error(error);
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
