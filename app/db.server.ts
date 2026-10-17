import { PrismaClient } from "@prisma/client";

declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

// Never replace a missing or misconfigured database with ephemeral storage.
// Schema changes are applied by `prisma migrate deploy`, not by requests.
if (!process.env.DATABASE_URL || !/^postgres(?:ql)?:\/\//.test(process.env.DATABASE_URL)) {
  throw new Error("Set DATABASE_URL to a PostgreSQL connection string. See .env.example and README.md.");
}

const prisma: PrismaClient = global.prismaGlobal ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

export default prisma;
