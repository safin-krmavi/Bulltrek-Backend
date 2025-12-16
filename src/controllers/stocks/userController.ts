import { Request, Response } from "express";
import * as stocksUserService from "../../services/stocks/userService";
import {
  sendSuccess,
  sendCreated,
  sendBadRequest,
  sendUnauthorized,
  sendServerError,
} from "../../utils/response";

export async function signupController(req: Request, res: Response) {
  try {
    const { name, email, phone, password, roleId } = req.body;

    const result = await stocksUserService.signupStocksUser({
      name,
      email,
      phone,
      password,
      roleId,
    });

    return sendCreated(res, "Signup successful, verify email", {
      user: result.user.id,
      verifyToken: result.verifyToken,
    });
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function verifyController(req: Request, res: Response) {
  try {
    const { userId } = req.body;
    const user = await stocksUserService.verifyStocksUser(userId);

    return sendSuccess(res, "User verified", user);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function loginController(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const result = await stocksUserService.loginStocksUser(email, password);

    return sendSuccess(res, "Login successful", {
      token: result.token,
      user: result.user,
    });
  } catch (err: any) {
    if (err.message === "Invalid credentials") {
      return sendUnauthorized(res, err.message);
    }
    if (err.message === "Email not verified") {
      return sendUnauthorized(res, err.message);
    }
    return sendServerError(res, err?.message || "Unexpected error ");
  }
}

export async function updateUserController(req: any, res: Response) {
  const userId = req.user.userId; // from auth middleware
  const updateData = req.body;

  try {
    const updatedUser = await stocksUserService.updateStocksUser(
      userId,
      updateData
    );
    return sendSuccess(res, "User updated successfully", updatedUser);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}
export async function getUserController(req: any, res: Response) {
  const userId = req.user.userId;

  try {
    const user = await stocksUserService.getStocksUser(userId);
    return sendSuccess(res, "User retrieved successfully", user);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function deleteUserController(req: any, res: Response) {
  const userId = req.user.userId;

  try {
    await stocksUserService.deleteStocksUser(userId);
    return sendSuccess(res, "User deleted successfully", {});
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}
