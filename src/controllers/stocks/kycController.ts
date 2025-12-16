import { Request, Response } from "express";
import * as kycService from "../../services/stocks/kycService";
import { sendCreated, sendSuccess, sendBadRequest } from "../../utils/response";
export async function submitKYCController(req: any, res: Response) {
  try {
    const file = req.file;
    if (!file) return sendBadRequest(res, "Document is required");

    const userId = req.user.userId;
    const documentUrl = file.location;

    const kyc = await kycService.submitKYC(userId, documentUrl);
    return sendCreated(res, "KYC submitted", kyc);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function listKYCsController(req: Request, res: Response) {
  try {
    const kycs = await kycService.getKYCs();
    return sendSuccess(res, "KYC records fetched", kycs);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function approveKYCController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { adminNote } = req.body;

    const updated = await kycService.updateKYCStatus(id, "APPROVED", adminNote);
    return sendSuccess(res, "KYC approved", updated);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function rejectKYCController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { rejectionReason, adminNote } = req.body;

    const updated = await kycService.updateKYCStatus(
      id,
      "REJECTED",
      adminNote,
      rejectionReason
    );
    return sendSuccess(res, "KYC rejected", updated);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function getMyKYCsController(req: any, res: Response) {
  try {
    const userId = req.user.userId;
    const history = await kycService.getUserKYCs(userId);

    return sendSuccess(res, "KYC history fetched", history);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}
