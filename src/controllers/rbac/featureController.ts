import { Request, Response } from "express";
import * as featureService from "../../services/rbac/featureService";
import {
  sendBadRequest,
  sendCreated,
  sendSuccess,
  sendNotFound,
} from "../../utils/response";
import { Website } from "@prisma/client";

export async function createFeatureController(req: Request, res: Response) {
  try {
    const { name, website } = req.body;
    const feature = await featureService.createFeature(name, website);
    return sendCreated(res, "Feature created", feature);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function getFeaturesController(req: Request, res: Response) {
  try {
    const { website } = req.query;
    const features = await featureService.getFeatures(website as Website);
    return sendSuccess(res, "Features fetched", features);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function getFeatureController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const feature = await featureService.getFeature(id);
    if (!feature) return sendNotFound(res, "Feature not found");
    return sendSuccess(res, "Feature fetched", feature);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function updateFeatureController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, website } = req.body;
    const updated = await featureService.updateFeature(id, { name, website });
    return sendSuccess(res, "Feature updated", updated);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function deleteFeatureController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await featureService.deleteFeature(id);
    return sendSuccess(res, "Feature deleted");
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}
