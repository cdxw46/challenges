export const brand = {
  name: "SMURFX",
  claim: "Move in blue",
  colors: {
    primary: "#534AB7",
    lavender: "#CECBF6",
    white: "#FFFFFF",
    black: "#050505",
    slate: "#0F172A",
  },
};

export const productLines = [
  { key: "SmurfAir", slogan: "Vuela" },
  { key: "SmurfForce", slogan: "Domina" },
  { key: "SmurfRun", slogan: "Sin límites" },
  { key: "SmurfGlide", slogan: "Deslízate" },
  { key: "SmurfTrail", slogan: "Conquista" },
] as const;

export type ProductLine = (typeof productLines)[number]["key"];

export type ProductSort =
  | "relevance"
  | "newest"
  | "price-asc"
  | "price-desc"
  | "top-rated";

export type ProductFilters = {
  q?: string;
  category?: string;
  gender?: string;
  line?: ProductLine | string;
  activity?: string;
  sale?: boolean;
  isNew?: boolean;
  priceMin?: number;
  priceMax?: number;
  sort?: ProductSort;
  limit?: number;
  offset?: number;
};
