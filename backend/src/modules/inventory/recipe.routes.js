import { Router } from 'express';
import recipeController from './recipe.controller.js';
import { authenticate } from '../../middlewares/auth.middleware.js';
import { authorize } from '../../middlewares/rbac.middleware.js';

const router = Router();
router.use(authenticate, authorize(['SUPER_ADMIN', 'BRANCH_ADMIN', 'ACCOUNTANT']));
router.get('/', recipeController.listRecipes);
router.post('/', recipeController.createRecipe);
router.get('/:id/cost', recipeController.getRecipeCost);
router.get('/:id', recipeController.getRecipe);
router.put('/:id', recipeController.updateRecipe);
router.delete('/:id', recipeController.deleteRecipe);
export default router;