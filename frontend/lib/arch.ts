import { RECIPE_ARCHES, type RecipeArch } from "@/lib/generated/bindings"

export { RECIPE_ARCHES, type RecipeArch }

export function isRecipeArch(s: string): s is RecipeArch {
  return (RECIPE_ARCHES as readonly string[]).includes(s)
}
