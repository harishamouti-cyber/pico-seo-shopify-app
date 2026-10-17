/**
 * Minimal structural type for the Admin GraphQL client returned by
 * `authenticate.admin`, `authenticate.webhook` and `authenticate.public.appProxy`.
 * Method syntax keeps it bivariant so all three contexts are assignable.
 */
export interface AdminClient {
  graphql(query: string, options?: { variables?: Record<string, unknown> }): Promise<Response>;
}

export class ShopifyGraphqlError extends Error {
  constructor(
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ShopifyGraphqlError";
  }
}

export async function gql<T>(admin: AdminClient, query: string, variables?: Record<string, unknown>): Promise<T> {
  let response: Response;
  try {
    response = await admin.graphql(query, variables ? { variables } : undefined);
  } catch (error) {
    // Shopify uses thrown Responses for token refresh and App Bridge redirects.
    // Remix must receive the original status, body, and authentication headers.
    if (error instanceof Response) throw error;
    // shopify-app-remix throws GraphqlQueryError with a `body` payload.
    const body = (error as { body?: { errors?: unknown } })?.body;
    throw new ShopifyGraphqlError(
      error instanceof Error ? error.message : "Shopify GraphQL request failed",
      body?.errors ?? error,
    );
  }
  if (response.status === 401 || (response.status >= 300 && response.status < 400)) {
    throw response;
  }
  const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!response.ok || body.errors?.length || !body.data) {
    throw new ShopifyGraphqlError(body.errors?.map((e) => e.message).join("; ") || "Empty GraphQL response", body.errors);
  }
  return body.data;
}

export interface UserError {
  field?: string[] | null;
  message: string;
}

export function formatUserErrors(errors: UserError[] | undefined | null) {
  return (errors ?? []).map((e) => e.message).join("; ");
}
