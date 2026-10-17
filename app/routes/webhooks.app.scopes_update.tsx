import type { ActionFunctionArgs } from "@remix-run/node";
import prisma from "../db.server";
import { authenticate } from "../shopify.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { payload, session } = await authenticate.webhook(request);
  const current = payload.current as string[] | undefined;

  if (session && current) {
    await prisma.session.update({
      where: { id: session.id },
      data: { scope: current.toString() },
    });
  }

  return new Response(null, { status: 200 });
};
