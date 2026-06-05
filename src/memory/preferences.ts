import fs from "fs/promises";
import path from "path";
import { UserPreferences } from "../types/grocery";
import { config } from "../app/config";

const prefsPath = path.join(config.paths.state, "preferences.json");

const defaults: UserPreferences = {
  organicPreference: false,
  organicCategories: ["dairy", "eggs", "meat"],
  deliveryPreference: "delivery",
  substitutionPolicy: "ask",
  maxOrderTotalUSD: 150,
  brands: {},
  sizes: {},
  itemDefaults: {},
  avoid: [],
};

export async function loadPreferences(): Promise<UserPreferences> {
  try {
    const raw = await fs.readFile(prefsPath, "utf-8");
    return { ...defaults, ...JSON.parse(raw) } as UserPreferences;
  } catch {
    return defaults;
  }
}

export async function savePreferences(prefs: UserPreferences): Promise<void> {
  await fs.writeFile(prefsPath, JSON.stringify(prefs, null, 2), "utf-8");
}

export async function updateBrandPreference(
  item: string,
  brand: string
): Promise<void> {
  const prefs = await loadPreferences();
  prefs.brands[item.toLowerCase()] = brand;
  await savePreferences(prefs);
}
