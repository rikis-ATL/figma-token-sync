/**
 * Figma Variables API wrapper
 * Handles reading and writing Figma variables and collections
 */

export interface FigmaVariable {
  id: string;
  name: string;
  resolvedType: VariableResolvedDataType;
  valuesByMode: { [modeId: string]: VariableValue };
  variableCollectionId: string;
  description?: string;
}

export interface FigmaVariableCollection {
  id: string;
  name: string;
  modes: Array<{ modeId: string; name: string }>;
  defaultModeId: string;
  variableIds: string[];
}

/**
 * Get all variable collections in the current file
 */
export async function getAllVariableCollections(): Promise<FigmaVariableCollection[]> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections.map((collection) => ({
    id: collection.id,
    name: collection.name,
    modes: collection.modes,
    defaultModeId: collection.defaultModeId,
    variableIds: collection.variableIds,
  }));
}

/**
 * Get a variable collection by name
 */
export async function getVariableCollectionByName(
  name: string
): Promise<VariableCollection | null> {
  const collections = await figma.variables.getLocalVariableCollectionsAsync();
  return collections.find((c) => c.name === name) || null;
}

/**
 * Get or create a variable collection
 */
export async function getOrCreateCollection(name: string): Promise<VariableCollection> {
  let collection = await getVariableCollectionByName(name);

  if (!collection) {
    collection = figma.variables.createVariableCollection(name);
    console.log(`Created variable collection: ${name}`);
  }

  return collection;
}

/**
 * Get all modes for a specific collection
 */
export async function getCollectionModes(collectionName: string): Promise<Array<{modeId: string, name: string}>> {
  try {
    const collection = await getVariableCollectionByName(collectionName);

    if (!collection) {
      console.log(`Collection "${collectionName}" not found`);
      return [];
    }

    return collection.modes.map(mode => ({
      modeId: mode.modeId,
      name: mode.name
    }));
  } catch (error) {
    console.error(`Failed to get modes for collection "${collectionName}":`, error);
    return [];
  }
}

/**
 * Find mode ID by name in a collection
 */
export function getModeId(collection: VariableCollection, modeName?: string): string {
  if (!modeName) {
    return collection.defaultModeId;
  }

  const mode = collection.modes.find(m => m.name === modeName);
  if (mode) {
    return mode.modeId;
  }

  console.warn(`Mode "${modeName}" not found in collection "${collection.name}", using default mode`);
  return collection.defaultModeId;
}

/**
 * Get all variables in a collection
 */
export async function getVariablesInCollection(
  collection: VariableCollection
): Promise<Variable[]> {
  const variables = await Promise.all(
    collection.variableIds.map(async (id) => {
      return await figma.variables.getVariableByIdAsync(id);
    })
  );
  return variables.filter((v): v is Variable => v !== null);
}

/**
 * Get a variable by name within a collection
 */
export async function getVariableByName(
  collection: VariableCollection,
  name: string
): Promise<Variable | null> {
  const variables = await getVariablesInCollection(collection);
  return variables.find((v) => v.name === name) || null;
}

/**
 * Create or update a variable in a collection
 */
export async function setVariable(
  collection: VariableCollection,
  name: string,
  type: VariableResolvedDataType,
  value: VariableValue,
  description?: string
): Promise<Variable> {
  let variable = await getVariableByName(collection, name);

  if (!variable) {
    // Create new variable
    variable = figma.variables.createVariable(name, collection, type);
    console.log(`Created variable: ${name} (${type})`);
  } else {
    // Update existing variable
    if (variable.resolvedType !== type) {
      console.warn(
        `Variable ${name} type mismatch: expected ${type}, found ${variable.resolvedType}`
      );
      // Can't change type of existing variable, need to delete and recreate
      const variableId = variable.id;
      variable.remove();
      variable = figma.variables.createVariable(name, collection, type);
      console.log(`Recreated variable: ${name} with new type ${type}`);
    }
  }

  // Set value for default mode
  const modeId = collection.defaultModeId;
  variable.setValueForMode(modeId, value);

  // Set description if provided
  if (description) {
    variable.description = description;
  }

  return variable;
}

/**
 * Create or update a variable in a collection with specific mode support
 */
export async function setVariableForMode(
  collection: VariableCollection,
  name: string,
  type: VariableResolvedDataType,
  value: VariableValue,
  modeName?: string,
  description?: string
): Promise<Variable> {
  let variable = await getVariableByName(collection, name);

  if (!variable) {
    // Create new variable
    variable = figma.variables.createVariable(name, collection, type);
    console.log(`Created variable: ${name} (${type})`);
  } else {
    // Update existing variable
    if (variable.resolvedType !== type) {
      console.warn(
        `Variable ${name} type mismatch: expected ${type}, found ${variable.resolvedType}`
      );
      // Can't change type of existing variable, need to delete and recreate
      const variableId = variable.id;
      variable.remove();
      variable = figma.variables.createVariable(name, collection, type);
      console.log(`Recreated variable: ${name} with new type ${type}`);
    }
  }

  // Get the target mode ID
  const modeId = getModeId(collection, modeName);
  const modeName_display = modeName || 'default';

  // Set value for the specified mode
  variable.setValueForMode(modeId, value);
  console.log(`Set variable ${name} in mode "${modeName_display}"`);

  // Set description if provided
  if (description) {
    variable.description = description;
  }

  return variable;
}

/**
 * Delete a variable by name
 */
export async function deleteVariable(
  collection: VariableCollection,
  name: string
): Promise<boolean> {
  const variable = await getVariableByName(collection, name);
  if (variable) {
    variable.remove();
    console.log(`Deleted variable: ${name}`);
    return true;
  }
  return false;
}

/**
 * Get all variables in the file (across all collections)
 */
export async function getAllVariables(): Promise<FigmaVariable[]> {
  const collections = await getAllVariableCollections();
  const allVariables: FigmaVariable[] = [];

  for (const collection of collections) {
    const figmaCollection = await figma.variables.getVariableCollectionByIdAsync(
      collection.id
    );
    if (figmaCollection) {
      const variables = await getVariablesInCollection(figmaCollection);
      allVariables.push(
        ...variables.map((v) => ({
          id: v.id,
          name: v.name,
          resolvedType: v.resolvedType,
          valuesByMode: v.valuesByMode,
          variableCollectionId: v.variableCollectionId,
          description: v.description,
        }))
      );
    }
  }

  return allVariables;
}

/**
 * Delete a variable collection and all its variables
 */
export async function deleteCollection(name: string): Promise<boolean> {
  const collection = await getVariableCollectionByName(name);
  if (collection) {
    collection.remove();
    console.log(`Deleted collection: ${name}`);
    return true;
  }
  return false;
}

/**
 * Parse color string to RGBA object
 */
export function parseColor(colorString: string): RGBA | null {
  // Remove whitespace
  const color = colorString.trim();

  // Hex format: #RGB or #RRGGBB or #RRGGBBAA
  if (color.startsWith('#')) {
    let hex = color.slice(1);

    // Expand shorthand (#RGB -> #RRGGBB)
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }

    // Parse RRGGBB or RRGGBBAA
    if (hex.length === 6 || hex.length === 8) {
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const a = hex.length === 8 ? parseInt(hex.slice(6, 8), 16) / 255 : 1;

      return { r, g, b, a };
    }
  }

  // RGB/RGBA format: rgb(r, g, b) or rgba(r, g, b, a)
  if (!color || typeof color !== 'string') {
    console.error('⚠️  Invalid color value provided to parseColor:', color);
    return null;
  }

  const rgbMatch = color.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/
  );
  if (rgbMatch) {
    const r = parseInt(rgbMatch[1]) / 255;
    const g = parseInt(rgbMatch[2]) / 255;
    const b = parseInt(rgbMatch[3]) / 255;
    const a = rgbMatch[4] ? parseFloat(rgbMatch[4]) : 1;

    return { r, g, b, a };
  }

  return null;
}

/**
 * Parse dimension string to number (strips units)
 */
export function parseDimension(dimensionString: string): number {
  if (!dimensionString || typeof dimensionString !== 'string') {
    console.error('⚠️  Invalid dimension string provided to parseDimension:', dimensionString);
    return 0;
  }

  const dimension = dimensionString.trim();

  // Extract numeric value (handles px, rem, em, pt, etc.)
  const match = dimension.match(/^([\d.]+)/);
  if (match) {
    return parseFloat(match[1]);
  }

  // If no match, try parsing as number
  const num = parseFloat(dimension);
  return isNaN(num) ? 0 : num;
}

/**
 * Convert RGBA to hex string
 */
export function rgbaToHex(rgba: RGBA): string {
  const r = Math.round(rgba.r * 255)
    .toString(16)
    .padStart(2, '0');
  const g = Math.round(rgba.g * 255)
    .toString(16)
    .padStart(2, '0');
  const b = Math.round(rgba.b * 255)
    .toString(16)
    .padStart(2, '0');

  if (rgba.a < 1) {
    const a = Math.round(rgba.a * 255)
      .toString(16)
      .padStart(2, '0');
    return `#${r}${g}${b}${a}`;
  }

  return `#${r}${g}${b}`;
}
