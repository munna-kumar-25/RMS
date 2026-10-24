import React, { useState, useEffect } from 'react';
import {
  ScrollText,
  Plus,
  Trash2,
  Percent,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import Modal from '../common/Modal.tsx';
import { useAppStore } from '../../store/AppStore.tsx';
import { Recipe, RecipeIngredient } from '../../types/index.ts';

interface RecipeBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  recipeToEdit?: Recipe | null;
}

export const RecipeBuilderModal: React.FC<RecipeBuilderModalProps> = ({
  isOpen,
  onClose,
  recipeToEdit,
}) => {
  const { menuItems, inventoryItems, addRecipe, updateRecipe } = useAppStore();

  const [selectedMenuItemId, setSelectedMenuItemId] = useState('');
  const [ingredients, setIngredients] = useState<RecipeIngredient[]>([]);
  const [sellingPrice, setSellingPrice] = useState<number>(300);
  const [servingSize, setServingSize] = useState('1 Portion / Plate');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (recipeToEdit) {
      setSelectedMenuItemId(recipeToEdit.menuItemId);
      setIngredients(recipeToEdit.ingredients);
      setSellingPrice(recipeToEdit.sellingPrice);
      setServingSize(recipeToEdit.servingSize);
    } else if (menuItems.length > 0) {
      const firstItem = menuItems[0];
      setSelectedMenuItemId(firstItem._id);
      setSellingPrice(firstItem.price);
      setServingSize('1 Standard Plate');
      setIngredients([]);
    }
    setError(null);
  }, [recipeToEdit, isOpen, menuItems]);

  const handleMenuItemChange = (itemId: string) => {
    setSelectedMenuItemId(itemId);
    const item = menuItems.find((m) => m._id === itemId);
    if (item) {
      setSellingPrice(item.price);
    }
  };

  const addIngredientRow = () => {
    if (inventoryItems.length === 0) return;
    const inv = inventoryItems[0];
    const newIngredient: RecipeIngredient = {
      inventoryItemId: inv._id,
      inventoryItemName: inv.name,
      quantity: 0.1,
      unit: inv.unit,
      unitCost: inv.unitCost,
      cost: Number((0.1 * inv.unitCost).toFixed(2)),
    };
    setIngredients((prev) => [...prev, newIngredient]);
  };

  const handleIngredientChange = (index: number, invId: string) => {
    const inv = inventoryItems.find((i) => i._id === invId);
    if (!inv) return;
    setIngredients((prev) => {
      const copy = [...prev];
      const qty = copy[index].quantity;
      copy[index] = {
        ...copy[index],
        inventoryItemId: inv._id,
        inventoryItemName: inv.name,
        unit: inv.unit,
        unitCost: inv.unitCost,
        cost: Number((qty * inv.unitCost).toFixed(2)),
      };
      return copy;
    });
  };

  const handleQuantityChange = (index: number, qty: number) => {
    setIngredients((prev) => {
      const copy = [...prev];
      const validQty = Math.max(0, qty);
      copy[index] = {
        ...copy[index],
        quantity: validQty,
        cost: Number((validQty * copy[index].unitCost).toFixed(2)),
      };
      return copy;
    });
  };

  const removeIngredientRow = (index: number) => {
    setIngredients((prev) => prev.filter((_, i) => i !== index));
  };

  // Calculations
  const totalRecipeCost = ingredients.reduce((sum, ing) => sum + ing.cost, 0);
  const foodCostPercentage = sellingPrice > 0 ? (totalRecipeCost / sellingPrice) * 100 : 0;
  const grossProfit = Math.max(0, sellingPrice - totalRecipeCost);
  const grossMarginPercentage = sellingPrice > 0 ? (grossProfit / sellingPrice) * 100 : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMenuItemId) {
      setError('Please select a menu item.');
      return;
    }
    if (ingredients.length === 0) {
      setError('Please add at least one ingredient to the recipe.');
      return;
    }

    const item = menuItems.find((m) => m._id === selectedMenuItemId);
    const itemName = item ? item.name : 'Unknown Item';
    const catName = item ? item.categoryName : 'Main Course';

    const recipe: Recipe = {
      _id: recipeToEdit?._id || '',
      menuItemId: selectedMenuItemId,
      menuItemName: itemName,
      categoryName: catName,
      ingredients,
      totalRecipeCost: Number(totalRecipeCost.toFixed(2)),
      sellingPrice: Number(sellingPrice),
      foodCostPercentage: Number(foodCostPercentage.toFixed(1)),
      grossMarginPercentage: Number(grossMarginPercentage.toFixed(1)),
      servingSize,
    };
    setSaving(true);
    try {
      if (recipeToEdit) await updateRecipe(recipeToEdit._id, recipe);
      else await addRecipe(recipe);
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to save the recipe.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={recipeToEdit ? `Edit Recipe: ${recipeToEdit.menuItemName}` : 'Build New Menu Recipe'}
      maxWidth="max-w-3xl"
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        {error && (
          <div className="p-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-rose-600 dark:text-rose-300 text-xs font-medium">
            {error}
          </div>
        )}

        {/* Item Selection & Selling Price */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Select Menu Item *
            </label>
            <select
              value={selectedMenuItemId}
              onChange={(e) => handleMenuItemChange(e.target.value)}
              disabled={!!recipeToEdit}
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            >
              {menuItems.map((m) => (
                <option key={m._id} value={m._id}>
                  {m.name} ({m.categoryName})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Selling Price (₹)
            </label>
            <input
              type="number"
              min={1}
              value={sellingPrice}
              onChange={(e) => setSellingPrice(Number(e.target.value))}
              className="w-full px-3 py-2 text-xs font-bold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
              Serving Size / Yield
            </label>
            <input
              type="text"
              value={servingSize}
              onChange={(e) => setServingSize(e.target.value)}
              placeholder="e.g. 1 Plate (400g)"
              className="w-full px-3 py-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
            />
          </div>
        </div>

        {/* Dynamic Ingredients Table */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-1.5 uppercase tracking-wider">
              <ScrollText className="w-4 h-4 text-indigo-600" />
              <span>Recipe Ingredients ({ingredients.length})</span>
            </h4>
            <button
              type="button"
              onClick={addIngredientRow}
              className="flex items-center gap-1 text-xs font-bold text-indigo-600 hover:text-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 px-3 py-1.5 rounded-xl transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Ingredient</span>
            </button>
          </div>

          {ingredients.length === 0 ? (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-800/40 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
              <p className="text-xs text-slate-500">No ingredients added yet.</p>
              <button
                type="button"
                onClick={addIngredientRow}
                className="mt-2 text-xs font-bold text-indigo-600 hover:underline"
              >
                + Add your first ingredient
              </button>
            </div>
          ) : (
            <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden bg-white dark:bg-slate-900">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 dark:bg-slate-800/80 text-slate-600 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="py-2.5 px-3">Raw Material / Ingredient</th>
                    <th className="py-2.5 px-3 w-28">Quantity</th>
                    <th className="py-2.5 px-3 w-20">Unit</th>
                    <th className="py-2.5 px-3 w-24">Unit Cost (₹)</th>
                    <th className="py-2.5 px-3 w-24 text-right">Cost (₹)</th>
                    <th className="py-2.5 px-3 w-12 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {ingredients.map((ing, idx) => (
                    <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-2 px-3">
                        <select
                          value={ing.inventoryItemId}
                          onChange={(e) => handleIngredientChange(idx, e.target.value)}
                          className="w-full py-1 px-2 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                          {inventoryItems.map((inv) => (
                            <option key={inv._id} value={inv._id}>
                              {inv.name} ({inv.category})
                            </option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="number"
                          step="0.01"
                          min="0.001"
                          value={ing.quantity}
                          onChange={(e) => handleQuantityChange(idx, parseFloat(e.target.value) || 0)}
                          className="w-full py-1 px-2 text-xs font-semibold bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-500">{ing.unit}</td>
                      <td className="py-2 px-3 font-mono text-slate-600 dark:text-slate-400">
                        ₹{ing.unitCost}
                      </td>
                      <td className="py-2 px-3 text-right font-bold text-slate-900 dark:text-white">
                        ₹{ing.cost.toFixed(2)}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => removeIngredientRow(idx)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Real-time KPI Card Breakdown */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 bg-slate-50 dark:bg-slate-800/60 p-4 rounded-2xl border border-slate-200 dark:border-slate-800">
          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Total Recipe Cost
            </span>
            <span className="text-base font-bold text-slate-900 dark:text-white">
              ₹{totalRecipeCost.toFixed(2)}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Gross Profit
            </span>
            <span className="text-base font-bold text-emerald-600 dark:text-emerald-400">
              ₹{grossProfit.toFixed(2)}
            </span>
          </div>

          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Food Cost %
            </span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span
                className={`text-base font-black ${
                  foodCostPercentage < 32
                    ? 'text-emerald-600'
                    : foodCostPercentage < 42
                    ? 'text-amber-500'
                    : 'text-rose-600'
                }`}
              >
                {foodCostPercentage.toFixed(1)}%
              </span>
              {foodCostPercentage < 32 ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
              ) : (
                <AlertTriangle className="w-4 h-4 text-amber-500" />
              )}
            </div>
          </div>

          <div>
            <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
              Gross Margin %
            </span>
            <span className="text-base font-bold text-indigo-600 dark:text-indigo-400">
              {grossMarginPercentage.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm shadow-indigo-600/20 transition-colors disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? 'Saving…' : recipeToEdit ? 'Save Changes' : 'Save Recipe'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default RecipeBuilderModal;
