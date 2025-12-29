import { Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../config/db.config";
import { sendUnauthorized } from "../utils/response";

interface JwtPayload {
  userId: string;
  roleId: string;
}

export const verifyUser = async (
  req: any,
  res: Response,
  next: NextFunction
) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendUnauthorized(res, "Authorization header missing or invalid");
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "devsecret";

    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Check BOTH user types in parallel
    const [cryptoUser, stocksUser] = await Promise.all([
      prisma.cryptoUser.findUnique({
        where: { id: decoded.userId },
      }),
      prisma.stocksUser.findUnique({
        where: { id: decoded.userId },
      }),
    ]);

    // If neither exists or neither is verified → reject
    if (
      (!cryptoUser || !cryptoUser.isVerified) &&
      (!stocksUser || !stocksUser.isVerified)
    ) {
      return sendUnauthorized(res, "User not found or not verified");
    }

    // Attach user info
    req.user = {
      ...decoded,
      userType: cryptoUser?.isVerified ? "CRYPTO" : "STOCKS",
    };

    next();
  } catch (error) {
    return sendUnauthorized(res, "Invalid or expired token");
  }
};
