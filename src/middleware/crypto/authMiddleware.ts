// middleware/authMiddleware.ts
import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { sendUnauthorized } from "../../utils/response";
import prisma from "../../config/db.config";

interface JwtPayload {
  userId: string;
  roleId: string;
}

export async function verifyCryptoUser(
  req: any,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return sendUnauthorized(res, "Authorization header missing or invalid");
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "devsecret";

    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Attach user info to req object
    req.user = decoded;

    // Optional: check if user exists and is verified
    const cryptoUser = await prisma.cryptoUser.findUnique({
      where: { id: decoded.userId },
    });

    if (!cryptoUser || !cryptoUser.isVerified) {
      return sendUnauthorized(res, "User not found or not verified");
    }

    next();
  } catch (err: any) {
    return sendUnauthorized(res, "Invalid or expired token");
  }
}
