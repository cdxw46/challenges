export const BRAND = {
  name: "SMURFX",
  claim: "Move in blue",
  colors: {
    primary: "#534AB7",
    soft: "#CECBF6",
    ink: "#0A0A0A",
    paper: "#FFFFFF"
  },
  lines: [
    { slug: "smurfair", name: "SmurfAir", motto: "Vuela" },
    { slug: "smurfforce", name: "SmurfForce", motto: "Domina" },
    { slug: "smurfrun", name: "SmurfRun", motto: "Sin límites" },
    { slug: "smurfglide", name: "SmurfGlide", motto: "Deslízate" },
    { slug: "smurftrail", name: "SmurfTrail", motto: "Conquista" }
  ],
  activities: ["running", "training", "lifestyle", "trail", "basketball"],
  members: {
    levels: [
      { key: "blue", label: "Blue", min: 0, max: 499 },
      { key: "silver", label: "Silver", min: 500, max: 1999 },
      { key: "gold", label: "Gold", min: 2000, max: 4999 },
      { key: "elite", label: "Elite", min: 5000, max: Number.POSITIVE_INFINITY }
    ]
  }
} as const;

export type ProductLine = (typeof BRAND.lines)[number]["slug"];

export function levelForPoints(points: number) {
  return BRAND.members.levels
    .slice()
    .reverse()
    .find((l) => points >= l.min)!;
}
