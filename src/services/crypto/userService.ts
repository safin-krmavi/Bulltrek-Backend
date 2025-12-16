import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import prisma from "../../config/db.config";
import speakeasy from "speakeasy";
import QRCode from "qrcode";

const SALT_ROUNDS = 10;

export async function signupCryptoUser(data: {
  name: string;
  email: string;
  phone?: string;
  password: string;
  roleId: string;
}) {
  const existingUser = await prisma.cryptoUser.findUnique({
    where: { email: data.email },
  });
  if (existingUser) throw new Error("Email already registered");

  const hashedPassword = await bcrypt.hash(data.password, SALT_ROUNDS);

  const user = await prisma.cryptoUser.create({
    data: {
      name: data.name,
      email: data.email,
      phone: data.phone,
      password: hashedPassword,
      roleId: data.roleId,
      isVerified: false, // Dev mode: initially false
    },
  });

  // In dev mode, return a "verification token" for testing
  const verifyToken = jwt.sign(
    { userId: user.id },
    process.env.JWT_SECRET || "devsecret",
    { expiresIn: "24h" }
  );

  return { user, verifyToken };
}

export async function verifyCryptoUserMail(userId: string) {
  const user = await prisma.cryptoUser.update({
    where: { id: userId },
    data: { isVerified: true },
  });
  return user;
}

export async function loginCryptoUser(email: string, password: string) {
  const user = await prisma.cryptoUser.findUnique({ where: { email } });
  if (!user) throw new Error("Invalid credentials");
  if (!user.isVerified) throw new Error("Email not verified");

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) throw new Error("Invalid credentials");
  if (user.twoFAEnabled) {
    return {
      requires2FA: true,
      userId: user.id,
    };
  }
  const token = jwt.sign(
    { userId: user.id, roleId: user.roleId },
    process.env.JWT_SECRET || "devsecret",
    { expiresIn: "24h" }
  );

  return { token, user };
}
export async function updateCryptoUser(
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

  const updatedUser = await prisma.cryptoUser.update({
    where: { id: userId },
    data,
  });

  return updatedUser;
}

export async function getCryptoUser(userId: string) {
  const user = await prisma.cryptoUser.findUnique({
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

export async function deleteCryptoUser(userId: string) {
  await prisma.cryptoUser.delete({
    where: { id: userId },
  });
}

// 2FA

export async function initiateTwoFactorAuth(userId: string) {
  const secret = speakeasy.generateSecret({
    // length: 20,
    name: `BullTrek Crypto ${userId}`,
  });

  await prisma.cryptoUser.update({
    where: { id: userId },
    data: {
      twoFASecret: secret.base32,
    },
  });

  const qrCode = await QRCode.toDataURL(secret.otpauth_url!);

  return {
    qrCode,
    manualKey: secret.base32,
  };
}

export async function confirmTwoFactorAuth(userId: string, token: string) {
  const user = await prisma.cryptoUser.findUnique({
    where: { id: userId },
  });

  if (!user?.twoFASecret) {
    throw new Error("2FA not initiated");
  }

  const verified = speakeasy.totp.verify({
    secret: user.twoFASecret,
    encoding: "base32",
    token,
    window: 1,
  });

  if (!verified) {
    throw new Error("Invalid 2FA token");
  }

  await prisma.cryptoUser.update({
    where: { id: userId },
    data: { twoFAEnabled: true },
  });

  return true;
}

export async function verifyTwoFactorLogin(userId: string, token: string) {
  const user = await prisma.cryptoUser.findUnique({
    where: { id: userId },
  });

  if (!user || !user.twoFAEnabled || !user.twoFASecret) {
    throw new Error("2FA not enabled");
  }

  const valid = speakeasy.totp.verify({
    secret: user.twoFASecret,
    encoding: "base32",
    token,
    window: 1,
  });

  if (!valid) throw new Error("Invalid 2FA token");

  const jwtToken = jwt.sign(
    { userId: user.id, roleId: user.roleId },
    process.env.JWT_SECRET || "devsecret",
    { expiresIn: "24h" }
  );

  return { token: jwtToken, user };
}
