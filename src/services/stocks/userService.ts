import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../../config/db.config";

const SALT_ROUNDS = 10;

export async function signupStocksUser(data: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  roleId: string;
}) {
  const existingUser = await prisma.stocksUser.findUnique({
    where: { email: data.email },
  });
  if (existingUser) throw new Error("Email already registered");

  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

  const user = await prisma.stocksUser.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: hashedPassword,
      roleId: data.roleId,
      isVerified: false,
    },
  });

  const verifyToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET || "devsecret",
    { expiresIn: "24h" }
  );

  return { user, verifyToken };
}

export async function verifyStocksUser(userId: string) {
  const user = await prisma.stocksUser.update({
    where: { id: userId },
    data: { isVerified: true },
  });

  return user;
}

export async function loginStocksUser(email: string, password: string) {
  const user = await prisma.stocksUser.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid credentials");
  if (!user.isVerified) throw new Error("Email not verified");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error("Invalid credentials");

  const token = jwt.sign(
    { userId: user.id, roleId: user.roleId },
    process.env.JWT_SECRET || "devsecret",
    { expiresIn: "24h" }
  );

  return { token, user };
}
export async function updateStocksUser(
  userId: string,
  data: Partial<{
    name: string;
    phone: string;
    password: string;
    membership: string;
  }>
) {
  if (data.password) {
    data.password = await bcrypt.hash(data.password, SALT_ROUNDS);
  }

  const updatedUser = await prisma.stocksUser.update({
    where: { id: userId },
    data,
  });

  return updatedUser;
}

export async function getStocksUser(userId: string) {
  const user = await prisma.stocksUser.findUnique({
    where: { id: userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      roleId: true,
      membership: true,
      isVerified: true,
      createdAt: true,
    },
  });

  if (!user) throw new Error("User not found");
  return user;
}

export async function deleteStocksUser(userId: string) {
  await prisma.stocksUser.delete({
    where: { id: userId },
  });
}
