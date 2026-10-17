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
    // shopify-app-remix throws GraphqlQueryError with a `body` payload.
    const body = (error as { body?: { errors?: unknown } })?.body;
    throw new ShopifyGraphqlError(
      error instanceof Error ? error.message : "Shopify GraphQL request failed",
      body?.errors ?? error,
    );
  }
  const body = (await response.json()) as { data?: T; errors?: Array<{ message: string }> };
  if (!body.data) {
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
