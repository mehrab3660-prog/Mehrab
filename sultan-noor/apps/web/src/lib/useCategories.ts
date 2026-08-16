"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import { Category } from "@/lib/types";

export function useCategoryTree() {
  const [categories, setCategories] = useState<Category[]>([]);

  useEffect(() => {
    api
      .get<Category[]>("/categories/tree")
      .then(setCategories)
      .catch(() => setCategories([]));
  }, []);

  return categories;
}
