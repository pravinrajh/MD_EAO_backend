import bcrypt from "bcrypt";
import { connectDatabase, disconnectDatabase } from "../src/config/database";
import { logger } from "../src/config/logger";
import { User } from "../src/models/User";
import type { Role } from "../src/utils/constants";
import { ROLES } from "../src/utils/constants";

async function createAdmin(): Promise<void> {
  const name = process.env.ADMIN_NAME ?? "Managing Director";
  const email = (process.env.ADMIN_EMAIL ?? "md@office.local").toLowerCase();
  const phone = process.env.ADMIN_PHONE ?? "9876543210";
  const password = process.env.ADMIN_PASSWORD ?? "SecurePassword123";
  const role = (process.env.ADMIN_ROLE ?? "MD") as Role;

  if (!ROLES.includes(role) || (role !== "MD" && role !== "ADMIN")) {
    throw new Error("ADMIN_ROLE must be MD or ADMIN");
  }

  await connectDatabase();

  const existing = await User.findOne({ email });
  if (existing) {
    logger.info({ email }, "Admin user already exists");
    await disconnectDatabase();
    return;
  }

  await User.create({
    name,
    email,
    phone,
    passwordHash: await bcrypt.hash(password, 12),
    role,
    status: "ACTIVE",
    isActive: true,
  });

  logger.info({ email, role }, "Admin user created");
  await disconnectDatabase();
}

createAdmin().catch((error) => {
  logger.fatal({ err: error }, "Failed to create admin user");
  process.exit(1);
});
