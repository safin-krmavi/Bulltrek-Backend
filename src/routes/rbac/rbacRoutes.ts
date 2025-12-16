import express from "express";
import * as roleController from "../../controllers/rbac/roleController";
import * as featureController from "../../controllers/rbac/featureController";
import * as roleFeatureController from "../../controllers/rbac/roleFeatureController";

const router = express.Router();

// Role-Feature linking
router.post("/role/feature", roleFeatureController.assignFeatureController);
router.delete("/role/feature", roleFeatureController.removeFeatureController);
router.get(
  "/role/:roleId/features",
  roleFeatureController.getRoleFeaturesController
);

// Role CRUD
router.post("/role", roleController.createRoleController);
router.get("/roles", roleController.getRolesController);
router.get("/role/:id", roleController.getRoleController);
router.put("/role/:id", roleController.updateRoleController);
router.delete("/role/:id", roleController.deleteRoleController);

// Feature CRUD
router.post("/feature", featureController.createFeatureController);
router.get("/features", featureController.getFeaturesController);
router.get("/feature/:id", featureController.getFeatureController);
router.put("/feature/:id", featureController.updateFeatureController);
router.delete("/feature/:id", featureController.deleteFeatureController);

export default router;
