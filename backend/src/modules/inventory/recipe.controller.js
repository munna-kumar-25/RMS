import Recipe from './recipe.model.js';
import Ingredient from './stock.model.js';
import MenuItem from '../menu/item.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';

const branchFor = (req, requested) => req.user.role === 'SUPER_ADMIN' ? requested : req.user.branchId;
const costing = (ingredients = [], sellingPrice = 0) => {
  const lines = ingredients.map((line) => ({ ...line, totalCost: Number(line.quantity || 0) * Number(line.costPerUnit || 0) }));
  const totalCost = lines.reduce((sum, line) => sum + line.totalCost, 0);
  const price = Number(sellingPrice) || 0;
  return { ingredients: lines, totalCost, foodCostPercentage: price ? (totalCost / price) * 100 : 0, grossMargin: price - totalCost };
};

const canAccess = (req, recipe) => req.user.role === 'SUPER_ADMIN' || String(req.user.branchId) === String(recipe.branchId);

const validateRecipeReferences = async (branchId, menuItemId, ingredients) => {
  const [menuItem, inventoryItems] = await Promise.all([
    MenuItem.exists({ _id: menuItemId, branchId }),
    Ingredient.find({ _id: { $in: (ingredients || []).map((line) => line.ingredientId) }, branchId }).select('_id'),
  ]);
  if (!menuItem) throw new Error('Recipe menu item must belong to the same branch.');
  if (!ingredients?.length || inventoryItems.length !== new Set(ingredients.map((line) => String(line.ingredientId))).size) {
    throw new Error('Recipes need ingredients that belong to the same branch.');
  }
};

export const listRecipes = async (req, res) => {
  const branchId = branchFor(req, req.query.branchId);
  const recipes = await Recipe.find(branchId ? { branchId } : {}).sort('-updatedAt');
  return sendSuccess(res, recipes, 'Recipes retrieved.');
};

export const getRecipe = async (req, res) => {
  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return sendError(res, 'Recipe not found.', 404);
  if (!canAccess(req, recipe)) return sendError(res, 'Branch access denied.', 403);
  return sendSuccess(res, recipe, 'Recipe retrieved.');
};

export const createRecipe = async (req, res) => {
  try {
    const branchId = branchFor(req, req.body.branchId);
    if (!branchId) return sendError(res, 'Branch assignment is required.', 400);
    await validateRecipeReferences(branchId, req.body.menuItemId, req.body.ingredients);
    const recipe = await Recipe.create({ ...req.body, branchId, ...costing(req.body.ingredients, req.body.sellingPrice) });
    return sendSuccess(res, recipe, 'Recipe created.', 201);
  } catch (error) {
    return sendError(res, error.code === 11000 ? 'A recipe already exists for this menu item and branch.' : error.message, error.code === 11000 ? 409 : 400);
  }
};

export const updateRecipe = async (req, res) => {
  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return sendError(res, 'Recipe not found.', 404);
  if (!canAccess(req, recipe)) return sendError(res, 'Branch access denied.', 403);
  const ingredients = req.body.ingredients ?? recipe.ingredients;
  const sellingPrice = req.body.sellingPrice ?? recipe.sellingPrice;
  const menuItemId = req.body.menuItemId ?? recipe.menuItemId;
  try {
    await validateRecipeReferences(recipe.branchId, menuItemId, ingredients);
  } catch (error) {
    return sendError(res, error.message, 400);
  }
  for (const field of ['menuItemId', 'ingredients', 'sellingPrice', 'status']) {
    if (req.body[field] !== undefined) recipe[field] = req.body[field];
  }
  Object.assign(recipe, costing(ingredients, sellingPrice));
  recipe.version += 1;
  await recipe.save();
  return sendSuccess(res, recipe, 'Recipe updated.');
};

export const deleteRecipe = async (req, res) => {
  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return sendError(res, 'Recipe not found.', 404);
  if (!canAccess(req, recipe)) return sendError(res, 'Branch access denied.', 403);
  await recipe.deleteOne();
  return sendSuccess(res, null, 'Recipe deleted.');
};

export const getRecipeCost = async (req, res) => {
  const recipe = await Recipe.findById(req.params.id);
  if (!recipe) return sendError(res, 'Recipe not found.', 404);
  if (!canAccess(req, recipe)) return sendError(res, 'Branch access denied.', 403);
  return sendSuccess(res, costing(recipe.ingredients, recipe.sellingPrice), 'Recipe cost calculated.');
};

export default { listRecipes, getRecipe, createRecipe, updateRecipe, deleteRecipe, getRecipeCost };