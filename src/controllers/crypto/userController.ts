import { Request, Response } from "express";
import * as cryptoUserService from "../../services/crypto/userService";
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
    const result = await cryptoUserService.signupCryptoUser({
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
    const user = await cryptoUserService.verifyCryptoUserMail(userId);

    return sendSuccess(res, "User verified", user);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function loginController(req: Request, res: Response) {
  try {
    const { email, password } = req.body;
    const result = await cryptoUserService.loginCryptoUser(email, password);

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

// Update user details
export async function updateUserController(req: any, res: Response) {
  const userId = req.user.userId;
  const updateData = req.body;

  try {
    const updatedUser = await cryptoUserService.updateCryptoUser(
      userId,
      updateData
    );
    return sendSuccess(res, "User updated successfully", updatedUser);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

// Get user details
export async function getUserController(req: any, res: Response) {
  const userId = req.user.userId;

  try {
    const user = await cryptoUserService.getCryptoUser(userId);
    return sendSuccess(res, "User retrieved successfully", user);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

// Delete user
export async function deleteUserController(req: any, res: Response) {
  const userId = req.user.userId;

  try {
    await cryptoUserService.deleteCryptoUser(userId);
    return sendSuccess(res, "User deleted successfully", {});
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

// 2FA

export async function initiateTwoFactorAuthController(req: any, res: Response) {
  try {
    const data = await cryptoUserService.initiateTwoFactorAuth(req.user.userId);
    return sendSuccess(res, "2FA initiated", data);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function confirmTwoFactorAuthController(req: any, res: Response) {
  try {
    const { token } = req.body;
    if (!token) {
      return sendBadRequest(res, "Token required");
    }

    await cryptoUserService.confirmTwoFactorAuth(req.user.userId, token);
    return sendSuccess(res, "2FA enabled successfully", {});
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function verifyTwoFactorLoginController(
  req: Request,
  res: Response
) {
  try {
    const { userId, token } = req.body;

    if (!userId || !token) {
      return sendBadRequest(res, "userId and token are required");
    }

    const result = await cryptoUserService.verifyTwoFactorLogin(userId, token);

    return sendSuccess(res, "Login successful", {
      token: result.token,
      user: result.user,
    });
  } catch (err: any) {
    if (err.message === "Invalid 2FA token") {
      return sendUnauthorized(res, err.message);
    }

    if (err.message === "2FA not enabled") {
      return sendBadRequest(res, err.message);
    }

    return sendBadRequest(res, err.message || "2FA verification failed");
  }
}
