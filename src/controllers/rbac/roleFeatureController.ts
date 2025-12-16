import { Request, Response } from "express";
import * as roleFeatureService from "../../services/rbac/roleFeatureService";
import { sendBadRequest, sendCreated, sendSuccess } from "../../utils/response";

export async function assignFeatureController(req: Request, res: Response) {
  try {
    const { roleId, featureId } = req.body;
    const link = await roleFeatureService.assignFeature(roleId, featureId);
    return sendCreated(res, "Feature assigned", link);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function removeFeatureController(req: Request, res: Response) {
  try {
    const { roleId, featureId } = req.body;
    await roleFeatureService.removeFeature(roleId, featureId);
    return sendSuccess(res, "Feature removed");
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function getRoleFeaturesController(req: Request, res: Response) {
  try {
    const { roleId } = req.params;
    const features = await roleFeatureService.getRoleFeatures(roleId);
    return sendSuccess(res, "Role features fetched", features);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}
