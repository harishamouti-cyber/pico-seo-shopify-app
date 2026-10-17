import { type AdminClient, gql } from "./graphql.server";

export interface ThemeEmbedInfo {
  themeName: string;
  themeId: string | null;
  deepLinkUrl: string;
}

const MAIN_THEME_QUERY = `#graphql
  query PicoMainTheme {
    themes(first: 5, roles: [MAIN]) {
      nodes {
        id
        name
        role
      }
    }
  }
`;

export async function getThemeEmbedInfo(
  admin: AdminClient,
  shop: string,
): Promise<ThemeEmbedInfo> {
  const storeSlug = shop.replace(/\.myshopify\.com$/i, "");
  const apiKey = process.env.SHOPIFY_API_KEY || "";
  const deepLinkUrl = apiKey
    ? `https://admin.shopify.com/store/${storeSlug}/themes/current/editor?context=apps&activateAppId=${apiKey}/picoseo-head`
    : `https://admin.shopify.com/store/${storeSlug}/themes/current/editor?context=apps`;

  try {
    const data = await gql<{
      themes: { nodes: Array<{ id: string; name: string }> };
    }>(admin, MAIN_THEME_QUERY);
    const main = data.themes?.nodes?.[0];
    return {
      themeName: main?.name || "Active storefront theme",
      themeId: main?.id || null,
      deepLinkUrl,
    };
  } catch (error) {
    if (error instanceof Response) throw error;
    return {
      themeName: "Active storefront theme",
      themeId: null,
      deepLinkUrl,
    };
  }
}
