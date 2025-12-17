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
export function getAllVariableCollections(): FigmaVariableCollection[] {
  const collections = figma.variables.getLocalVariableCollections();
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
export function getVariableCollectionByName(
  name: string
): VariableCollection | null {
  const collections = figma.variables.getLocalVariableCollections();
  return collections.find((c) => c.name === name) || null;
}

/**
 * Get or create a variable collection
 */
export function getOrCreateCollection(name: string): VariableCollection {
  let collection = getVariableCollectionByName(name);

  if (!collection) {
    collection = figma.variables.createVariableCollection(name);
    console.log(`Created variable collection: ${name}`);
  }

  return collection;
}

/**
 * Get all variables in a collection
 */
export function getVariablesInCollection(
  collection: VariableCollection
): Variable[] {
  return collection.variableIds
    .map((id) => figma.variables.getVariableById(id))
    .filter((v): v is Variable => v !== null);
}

/**
 * Get a variable by name within a collection
 */
export function getVariableByName(
  collection: VariableCollection,
  name: string
): Variable | null {
  const variables = getVariablesInCollection(collection);
  return variables.find((v) => v.name === name) || null;
}

/**
 * Create or update a variable in a collection
 */
export function setVariable(
  collection: VariableCollection,
  name: string,
  type: VariableResolvedDataType,
  value: VariableValue,
  description?: string
): Variable {
  let variable = getVariableByName(collection, name);

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
 * Delete a variable by name
 */
export function deleteVariable(
  collection: VariableCollection,
  name: string
): boolean {
  const variable = getVariableByName(collection, name);
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
export function getAllVariables(): FigmaVariable[] {
  const collections = getAllVariableCollections();
  const allVariables: FigmaVariable[] = [];

  for (const collection of collections) {
    const figmaCollection = figma.variables.getVariableCollectionById(
      collection.id
    );
    if (figmaCollection) {
      const variables = getVariablesInCollection(figmaCollection);
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
export function deleteCollection(name: string): boolean {
  const collection = getVariableCollectionByName(name);
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
