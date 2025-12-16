import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import prisma from "../../config/db.config";
import { sendUnauthorized } from "../../utils/response";

interface JwtPayload {
  userId: string;
  roleId: string;
}

export async function verifyStocksAdmin(
  req: any,
  res: Response,
  next: NextFunction
) {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith("Bearer ")) {
      return sendUnauthorized(res, "Missing or invalid token");
    }

    const token = authHeader.split(" ")[1];
    const secret = process.env.JWT_SECRET || "devsecret";

    const decoded = jwt.verify(token, secret) as JwtPayload;

    // Check user exists and is verified
    const user = await prisma.stocksUser.findUnique({
      where: { id: decoded.userId },
      include: { role: true },
    });

    if (!user || !user.isVerified) {
      return sendUnauthorized(res, "User not found or not verified");
    }

    // Check role is ADMIN for STOCKS website
    if (!user.role || user.role.name.toLowerCase() !== "admin_stocks") {
      return sendUnauthorized(res, "Admin access required");
    }

    req.user = decoded;
    next();
  } catch (err: any) {
    return sendUnauthorized(res, "Invalid or expired token");
  }
}
