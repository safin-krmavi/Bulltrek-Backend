// controllers/stocks/credentialsController.ts
import { Request, Response } from "express";
import * as credentialsService from "../../services/stocks/credentialsService";
import { sendCreated, sendSuccess, sendBadRequest } from "../../utils/response";

export async function addOrUpdateCredentialsController(
  req: Request,
  res: Response
) {
  try {
    const {
      userId,
      exchange,
      apiKey,
      clientCode,
      accessToken,
      refreshToken,
      feedToken,
      expiresAt,
    } = req.body;
    const creds = await credentialsService.addOrUpdateStocksCredentials({
      userId,
      exchange,
      apiKey,
      clientCode,
      accessToken,
      refreshToken,
      feedToken,
      expiresAt: new Date(expiresAt),
    });

    return sendCreated(res, "Credentials saved successfully", creds);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function getCredentialsController(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const creds = await credentialsService.getStocksCredentials(userId);
    return sendSuccess(res, "Credentials fetched successfully", creds);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function updateCredentialsController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const data = req.body;
    const updated = await credentialsService.updateStocksCredentials(id, data);
    return sendSuccess(res, "Credentials updated successfully", updated);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function deleteCredentialsController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await credentialsService.deleteStocksCredentials(id);
    return sendSuccess(res, "Credentials deleted successfully");
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}
