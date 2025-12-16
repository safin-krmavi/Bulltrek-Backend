import { Request, Response } from "express";
import * as roleService from "../../services/rbac/roleService";
import {
  sendBadRequest,
  sendCreated,
  sendSuccess,
  sendNotFound,
} from "../../utils/response";
import { Website } from "@prisma/client";

export async function createRoleController(req: Request, res: Response) {
  try {
    const { name, website } = req.body;
    const role = await roleService.createRole(name, website);
    return sendCreated(res, "Role created", role);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function getRolesController(req: Request, res: Response) {
  try {
    const { website } = req.query;
    const roles = await roleService.getRoles(website as Website);
    return sendSuccess(res, "Roles fetched", roles);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function getRoleController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const role = await roleService.getRole(id);
    if (!role) return sendNotFound(res, "Role not found");
    return sendSuccess(res, "Role fetched", role);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function updateRoleController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    const { name, website } = req.body;
    const updated = await roleService.updateRole(id, { name, website });
    return sendSuccess(res, "Role updated", updated);
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}

export async function deleteRoleController(req: Request, res: Response) {
  try {
    const { id } = req.params;
    await roleService.deleteRole(id);
    return sendSuccess(res, "Role deleted");
  } catch (err: any) {
    return sendBadRequest(res, err.message);
  }
}
