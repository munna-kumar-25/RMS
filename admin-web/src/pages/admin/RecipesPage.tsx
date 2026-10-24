import React, { useState, useMemo } from 'react';
import {
  ScrollText,
  Plus,
  Search,
  Percent,
  TrendingUp,
  DollarSign,
  AlertTriangle,
  CheckCircle2,
  Edit2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { useAppStore } from '../../store/AppStore.tsx';
import { Recipe } from '../../types/index.ts';

interface RecipesPageProps {
  onOpenRecipeBuilder: (recipe?: Recipe | null) => void;
}

export const RecipesPage: React.FC<RecipesPageProps> = ({
  onOpenRecipeBuilder,
}) => {
  const { recipes } = useAppStore();

  const [searchQuery, setSearchQuery] = useState('');
  const [expandedRecipeId, setExpandedRecipeId] = useState<string | null>(null);

  const filteredRecipes = useMemo(() => {
    return recipes.filter((r) =>
      r.menuItemName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      r.categoryName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [recipes, searchQuery]);

  // Calculations
  const totalRecipes = recipes.length;
  const avgFoodCostPercent =
    totalRecipes > 0
      ? Math.round(
          recipes.reduce((sum, r) => sum + r.foodCostPercentage, 0) / totalRecipes
        )
      : 0;
  const avgMargin =
    totalRecipes > 0
      ? Math.round(
          recipes.reduce((sum, r) => sum + r.grossMarginPercentage, 0) / totalRecipes
        )
      : 0;

  const toggleExpand = (id: string) => {
    setExpandedRecipeId((prev) => (prev === id ? null : id));
  };

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <ScrollText className="w-6 h-6 text-indigo-600" />
            <span>Recipe Standardization & Food Costing</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Ingredient-level bill of materials (BOM), automated yield costing, and gross margin optimization.
          </p>
        </div>

        <button
          type="button"
          onClick={() => onOpenRecipeBuilder(null)}
          className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold shadow-sm shadow-indigo-600/20 transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>Build New Recipe</span>
        </button>
      </div>

      {/* KPI Benchmarks */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Standardized Recipes
          </span>
          <span className="text-xl font-black text-slate-900 dark:text-white mt-1 block">
            {totalRecipes} Dishes
          </span>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Average Food Cost %
          </span>
          <div className="flex items-center gap-2 mt-1">
            <span
              className={`text-xl font-black ${
                avgFoodCostPercent <= 32
                  ? 'text-emerald-600'
                  : avgFoodCostPercent <= 40
                  ? 'text-amber-500'
                  : 'text-rose-600'
              }`}
            >
              {avgFoodCostPercent}%
            </span>
            <span className="text-xs text-slate-400 font-medium">Target: &lt; 32%</span>
          </div>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl">
          <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
            Average Gross Margin
          </span>
          <span className="text-xl font-black text-indigo-600 dark:text-indigo-400 mt-1 block">
            {avgMargin}%
          </span>
        </div>
      </div>

      {/* Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-3 rounded-2xl border border-slate-200 dark:border-slate-800">
        <div className="relative max-w-md">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search recipes by dish title or category..."
            className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Recipes List */}
      <div className="space-y-3">
        {filteredRecipes.map((recipe) => {
          const isExpanded = expandedRecipeId === recipe._id;
          const grossProfit = Math.max(0, recipe.sellingPrice - recipe.totalRecipeCost);

          return (
            <div
              key={recipe._id}
              className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm transition-all"
            >
              {/* Recipe Summary Bar */}
              <div className="p-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950 text-indigo-600 flex items-center justify-center shrink-0">
                    <ScrollText className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      {recipe.menuItemName}
                    </h3>
                    <p className="text-xs text-slate-400">
                      {recipe.categoryName} • Serving: {recipe.servingSize} • {recipe.ingredients.length} Ingredients
                    </p>
                  </div>
                </div>

                {/* Financial Metrics */}
                <div className="flex items-center gap-6 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Cost Price</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      ₹{recipe.totalRecipeCost.toFixed(2)}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Selling Price</span>
                    <span className="font-mono font-bold text-slate-900 dark:text-white">
                      ₹{recipe.sellingPrice}
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Food Cost %</span>
                    <span
                      className={`font-mono font-black ${
                        recipe.foodCostPercentage <= 32
                          ? 'text-emerald-600'
                          : recipe.foodCostPercentage <= 40
                          ? 'text-amber-500'
                          : 'text-rose-600'
                      }`}
                    >
                      {recipe.foodCostPercentage}%
                    </span>
                  </div>

                  <div>
                    <span className="text-[10px] text-slate-400 block font-semibold">Gross Profit</span>
                    <span className="font-mono font-bold text-emerald-600">
                      ₹{grossProfit.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => onOpenRecipeBuilder(recipe)}
                      className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg"
                      title="Edit Recipe"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleExpand(recipe._id)}
                      className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg"
                      title="Expand Ingredients"
                    >
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              </div>

              {/* Expanded Ingredient Bill of Materials (BOM) */}
              {isExpanded && (
                <div className="px-4 pb-4 pt-1 bg-slate-50 dark:bg-slate-800/40 border-t border-slate-100 dark:border-slate-800">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                    Ingredient Breakdown (BOM)
                  </span>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs text-left">
                      <thead className="text-slate-400 font-semibold border-b border-slate-200 dark:border-slate-700">
                        <tr>
                          <th className="py-1.5">Raw Material</th>
                          <th className="py-1.5">Quantity</th>
                          <th className="py-1.5">Unit Cost</th>
                          <th className="py-1.5 text-right">Line Cost</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200/60 dark:divide-slate-700/60">
                        {recipe.ingredients.map((ing, idx) => (
                          <tr key={idx}>
                            <td className="py-1.5 font-medium text-slate-800 dark:text-slate-200">
                              {ing.inventoryItemName}
                            </td>
                            <td className="py-1.5 font-mono text-slate-600 dark:text-slate-400">
                              {ing.quantity} {ing.unit}
                            </td>
                            <td className="py-1.5 font-mono text-slate-600 dark:text-slate-400">
                              ₹{ing.unitCost} / {ing.unit}
                            </td>
                            <td className="py-1.5 font-mono font-bold text-slate-900 dark:text-white text-right">
                              ₹{ing.cost.toFixed(2)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default RecipesPage;
