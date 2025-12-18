// controllers/crypto/credentialsController.ts
import { Request, Response } from "express";
import * as credentialsService from "../../services/crypto/credentialsService";
import { sendCreated, sendSuccess, sendBadRequest } from "../../utils/response";
import { CryptoExchange } from "@prisma/client";

export async function addOrUpdateCredentialsController(
  req: Request,
  res: Response
) {
  try {
    const {
      userId,
      exchange,
      apiKey,
      apiSecret,
      apiPassphrase,
      apiKeyVersion,
    } = req.body;

    if (!userId) {
      return sendBadRequest(res, "userId is required");
    }

    if (!exchange) {
      return sendBadRequest(res, "exchange is required");
    }
    if (!apiKey || !apiSecret) {
      return sendBadRequest(res, "apiKey and apiSecret are required");
    }
    if (exchange === CryptoExchange.KUCOIN) {
      if (!apiPassphrase || !apiKeyVersion) {
        return sendBadRequest(
          res,
          "KuCoin requires apiPassphrase and apiKeyVersion"
        );
      }
    }

    const creds = await credentialsService.addOrUpdateCryptoCredentials({
      userId,
      exchange,
      apiKey,
      apiSecret,
      apiPassphrase,
      apiKeyVersion,
    });
    return sendCreated(res, "Credentials saved successfully", creds);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function getCredentialsController(req: Request, res: Response) {
  try {
    const { userId } = req.params;
    const { exchange } = req.query;
    const creds = await credentialsService.getCryptoCredentials(
      userId,
      exchange as CryptoExchange | undefined
    );
    return sendSuccess(res, "Credentials fetched successfully", creds);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function updateCredentialsController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const data = req.body;
    const updated = await credentialsService.updateCryptoCredentials(id, data);
    return sendSuccess(res, "Credentials updated successfully", updated);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function deleteCredentialsController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await credentialsService.deleteCryptoCredentials(id);
    return sendSuccess(res, "Credentials deleted successfully");
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}
