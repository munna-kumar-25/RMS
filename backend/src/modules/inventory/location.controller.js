import mongoose from 'mongoose';
import Ingredient, { StockTransaction } from './stock.model.js';
import { InventoryLocation, OpeningStock, StockBalance } from './location.model.js';
import { sendError, sendSuccess } from '../../utils/responseHandler.js';

const branchIdFor = (req) => req.branch?._id || req.user.branchId;

export const listLocations = async (req, res) => {
  const locations = await InventoryLocation.find({ branchId: branchIdFor(req) }).sort({ isDefault: -1, name: 1 });
  return sendSuccess(res, locations, 'Inventory locations retrieved.');
};

export const createLocation = async (req, res) => {
  try {
    const location = await InventoryLocation.create({
      branchId: branchIdFor(req),
      name: req.body.name,
      code: req.body.code,
      kind: req.body.kind || 'WAREHOUSE',
      isDefault: Boolean(req.body.isDefault),
      createdBy: req.user._id,
    });
    return sendSuccess(res, location, 'Inventory location created.', 201);
  } catch (error) {
    return sendError(
      res,
      error.code === 11000 ? 'Location code already exists or another default location is already configured.' : error.message,
      error.code === 11000 ? 409 : 400
    );
  }
};

export const updateLocation = async (req, res) => {
  const location = await InventoryLocation.findOne({ _id: req.params.locationId, branchId: branchIdFor(req) });
  if (!location) return sendError(res, 'Inventory location not found.', 404);
  for (const field of ['name', 'kind', 'isDefault', 'isActive']) {
    if (req.body[field] !== undefined) location[field] = req.body[field];
  }
  if (location.isDefault && !location.isActive) return sendError(res, 'The default location must remain active.', 409);
  try {
    await location.save();
  } catch (error) {
    return sendError(
      res,
      error.code === 11000 ? 'Another default location is already configured.' : error.message,
      error.code === 11000 ? 409 : 400
    );
  }
  return sendSuccess(res, location, 'Inventory location updated.');
};

export const getOpeningStock = async (req, res) => {
  const openingStock = await OpeningStock.findOne({ branchId: branchIdFor(req) }).populate('lines.ingredientId', 'name sku unit').populate('lines.locationId', 'name code');
  return sendSuccess(res, openingStock, 'Opening stock review retrieved.');
};

export const saveOpeningStockDraft = async (req, res) => {
  const branchId = branchIdFor(req);
  if (!Array.isArray(req.body.lines) || req.body.lines.length === 0) {
    return sendError(res, 'Add at least one counted inventory item.', 400);
  }
  const lineKeys = new Set();
  const normalizedLines = [];
  for (const line of req.body.lines) {
    if (!mongoose.isValidObjectId(line.ingredientId) || !mongoose.isValidObjectId(line.locationId)) {
      return sendError(res, 'Each count must identify a valid inventory item and location.', 400);
    }
    const quantity = Number(line.quantity);
    if (!Number.isFinite(quantity) || quantity < 0) return sendError(res, 'Opening quantities must be zero or greater.', 400);
    const key = `${line.ingredientId}:${line.locationId}`;
    if (lineKeys.has(key)) return sendError(res, 'An inventory item can appear only once per location.', 400);
    lineKeys.add(key);
    normalizedLines.push({ ingredientId: line.ingredientId, locationId: line.locationId, quantity });
  }
  const ingredientIds = [...new Set(normalizedLines.map((line) => String(line.ingredientId)))];
  const locationIds = [...new Set(normalizedLines.map((line) => String(line.locationId)))];
  const [ingredients, locations, existing] = await Promise.all([
    Ingredient.find({ _id: { $in: ingredientIds }, branchId }).select('_id unit'),
    InventoryLocation.find({ _id: { $in: locationIds }, branchId, isActive: true }).select('_id'),
    OpeningStock.findOne({ branchId }),
  ]);
  if (ingredients.length !== ingredientIds.length || locations.length !== locationIds.length) {
    return sendError(res, 'Opening stock contains an item or location outside this branch.', 400);
  }
  if (existing?.status === 'POSTED' || existing?.status === 'POSTING') {
    return sendError(res, 'Opening stock has already been posted for this branch.', 409);
  }
  const units = new Map(ingredients.map((ingredient) => [String(ingredient._id), ingredient.unit]));
  const draft = await OpeningStock.findOneAndUpdate(
    { branchId, status: { $in: ['DRAFT'] } },
    {
      $set: {
        lines: normalizedLines.map((line) => ({ ...line, unit: units.get(String(line.ingredientId)) })),
        createdBy: req.user._id,
      },
      $setOnInsert: { branchId, status: 'DRAFT' },
    },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  );
  return sendSuccess(res, draft, 'Opening stock review saved as a draft.', 201);
};

export const postOpeningStock = async (req, res) => {
  const branchId = branchIdFor(req);
  const review = await OpeningStock.findOne({ branchId, status: { $in: ['DRAFT', 'POSTING'] } });
  if (!review) return sendError(res, 'Save an opening stock review before posting it.', 404);
  if (!review.lines.length) return sendError(res, 'Opening stock review has no counted items.', 400);

  const quantitiesByIngredient = new Map();
  for (const line of review.lines) {
    const id = String(line.ingredientId);
    quantitiesByIngredient.set(id, (quantitiesByIngredient.get(id) || 0) + line.quantity);
  }
  const [ingredients, existingMovements] = await Promise.all([
    Ingredient.find({ branchId }).select('_id currentStock minimumStock'),
    StockTransaction.exists({ branchId, type: { $ne: 'OPENING' } }),
  ]);
  if (existingMovements || (review.status === 'DRAFT' && ingredients.some((item) => item.currentStock !== 0))) {
    return sendError(res, 'Opening stock can only be posted before other stock movements are recorded.', 409);
  }
  if (ingredients.some((item) => !quantitiesByIngredient.has(String(item._id)))) {
    return sendError(res, 'Count every inventory item before posting opening stock.', 400);
  }

  if (review.status === 'DRAFT') {
    const claimed = await OpeningStock.updateOne({ _id: review._id, status: 'DRAFT' }, { $set: { status: 'POSTING' } });
    if (!claimed.modifiedCount) return sendError(res, 'Opening stock review is being posted by another request.', 409);
  }
  try {
    await StockBalance.bulkWrite(review.lines.map((line) => ({
      updateOne: {
        filter: { branchId, locationId: line.locationId, ingredientId: line.ingredientId },
        update: { $set: { quantity: line.quantity } },
        upsert: true,
      },
    })));
    const minimumByIngredient = new Map(ingredients.map((item) => [String(item._id), item.minimumStock]));
    await Ingredient.bulkWrite([...quantitiesByIngredient].map(([ingredientId, quantity]) => ({
      updateOne: {
        filter: { _id: ingredientId, branchId },
        update: { $set: { currentStock: quantity, status: quantity <= 0 ? 'OUT_OF_STOCK' : quantity <= (minimumByIngredient.get(ingredientId) || 0) ? 'LOW_STOCK' : 'IN_STOCK' } },
      },
    })));
    await StockTransaction.bulkWrite(review.lines.map((line) => ({
      updateOne: {
        filter: {
          type: 'OPENING',
          referenceType: 'opening_stock',
          referenceId: String(review._id),
          ingredientId: line.ingredientId,
          locationId: line.locationId,
        },
        update: {
          $set: {
            branchId,
            quantity: line.quantity,
            unit: line.unit,
            previousStock: 0,
            newStock: line.quantity,
            performedBy: req.user._id,
            reason: 'Reviewed branch opening count',
          },
        },
        upsert: true,
      },
    })));
    review.status = 'POSTED';
    review.postedBy = req.user._id;
    review.postedAt = new Date();
    await review.save();
  } catch (error) {
    return sendError(res, `Opening stock could not be posted: ${error.message}`, 500);
  }
  return sendSuccess(res, review, 'Opening stock posted and recorded.');
};

export default { listLocations, createLocation, updateLocation, getOpeningStock, saveOpeningStockDraft, postOpeningStock };
