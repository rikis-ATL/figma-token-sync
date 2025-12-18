/**
 * Transform Style Dictionary tokens to Figma variables
 */

import {
  getOrCreateCollection,
  setVariable,
  setVariableForMode,
  parseColor,
  parseDimension,
} from '../figma-api/variables';
import { StyleDictionaryTokens, StyleDictionaryToken } from '../../shared/types';

export interface TransformResult {
  success: boolean;
  collectionsCreated: number;
  variablesCreated: number;
  variablesUpdated: number;
  errors: string[];
  warnings: string[];
}

interface FlatToken {
  path: string;
  value: string | number | boolean;
  type?: string;
  comment?: string;
}

/**
 * Flatten nested token structure into array of tokens with paths
 */
function flattenTokens(
  tokens: StyleDictionaryTokens,
  prefix: string = ''
): FlatToken[] {
  const result: FlatToken[] = [];

  for (const [key, value] of Object.entries(tokens)) {
    const path = prefix ? `${prefix}/${key}` : key;

    if (isToken(value)) {
      // This is a token
      result.push({
        path,
        value: value.value,
        type: value.type,
        comment: value.comment,
      });
    } else {
      // This is a nested group, recurse
      result.push(...flattenTokens(value as StyleDictionaryTokens, path));
    }
  }

  return result;
}

/**
 * Check if an object is a token (has a 'value' property)
 */
function isToken(obj: any): obj is StyleDictionaryToken {
  return obj && typeof obj === 'object' && 'value' in obj;
}

/**
 * Determine Figma variable type from Style Dictionary type
 */
function getFigmaVariableType(
  sdType: string | undefined,
  value: any
): VariableResolvedDataType {
  const type = sdType?.toLowerCase();

  // Color types
  if (
    type === 'color' ||
    type === 'colorrgb' ||
    type === 'colorhex' ||
    type === 'colorrgba'
  ) {
    return 'COLOR';
  }

  // Dimension/number types
  if (
    type === 'dimension' ||
    type === 'size' ||
    type === 'sizing' ||
    type === 'spacing' ||
    type === 'fontsize' ||
    type === 'fontweight' ||
    type === 'lineheight' ||
    type === 'letterSpacing' ||
    type === 'opacity' ||
    type === 'number'
  ) {
    return 'FLOAT';
  }

  // Boolean type
  if (type === 'boolean') {
    return 'BOOLEAN';
  }

  // String types (font family, etc.)
  if (
    type === 'string' ||
    type === 'fontfamily' ||
    type === 'fontstyle' ||
    type === 'text'
  ) {
    return 'STRING';
  }

  // Infer from value if no type specified
  if (typeof value === 'boolean') {
    return 'BOOLEAN';
  }

  if (typeof value === 'number') {
    return 'FLOAT';
  }

  if (typeof value === 'string') {
    // Check if it looks like a color
    if (
      value.startsWith('#') ||
      value.startsWith('rgb') ||
      value.startsWith('hsl')
    ) {
      return 'COLOR';
    }

    // Check if it looks like a dimension
    if (/^\d+(\.\d+)?(px|rem|em|pt|%)$/.test(value)) {
      return 'FLOAT';
    }

    // Default to STRING
    return 'STRING';
  }

  // Default fallback
  return 'STRING';
}

/**
 * Convert Style Dictionary token value to Figma variable value
 */
function convertTokenValue(
  value: string | number | boolean | object,
  type: VariableResolvedDataType
): VariableValue | null {
  if (type === 'COLOR') {
    let colorValue = value;

    // Handle object values with .value property (common in Style Dictionary)
    if (typeof value === 'object' && value !== null && 'value' in value) {
      colorValue = value.value;
    }

    if (typeof colorValue === 'string') {
      const color = parseColor(colorValue);
      if (!color) {
        throw new Error(`Invalid color value: ${colorValue}`);
      }
      return color;
    }
    throw new Error(`Color value must be a string, got ${typeof colorValue} (original: ${typeof value})`);
  }

  if (type === 'FLOAT') {
    if (typeof value === 'number') {
      return value;
    }
    if (typeof value === 'string') {
      return parseDimension(value);
    }
    throw new Error(`Float value must be a number or string, got ${typeof value}`);
  }

  if (type === 'BOOLEAN') {
    if (typeof value === 'boolean') {
      return value;
    }
    if (typeof value === 'string') {
      return value.toLowerCase() === 'true';
    }
    throw new Error(`Boolean value must be a boolean or string, got ${typeof value}`);
  }

  if (type === 'STRING') {
    return String(value);
  }

  return null;
}

/**
 * Get collection name from token path
 * For now, use the first segment of the path
 */
function getCollectionName(path: string): string {
  const segments = path.split('/');
  if (segments.length > 0) {
    // Capitalize first letter
    const name = segments[0];
    return name.charAt(0).toUpperCase() + name.slice(1);
  }
  return 'Tokens';
}

/**
 * Get variable name from token path (everything after first segment)
 */
function getVariableName(path: string): string {
  const segments = path.split('/');
  if (segments.length > 1) {
    return segments.slice(1).join('/');
  }
  return segments[0];
}

/**
 * Transform Style Dictionary tokens to Figma variables
 */
export async function transformTokensToFigma(
  tokens: StyleDictionaryTokens,
  options: {
    collectionName?: string; // Override collection name
    clearExisting?: boolean; // Clear existing variables
    targetMode?: string; // Target mode to place variables in
  } = {}
): TransformResult {
  const result: TransformResult = {
    success: true,
    collectionsCreated: 0,
    variablesCreated: 0,
    variablesUpdated: 0,
    errors: [],
    warnings: [],
  };

  try {
    // Flatten tokens
    const flatTokens = flattenTokens(tokens);

    if (flatTokens.length === 0) {
      result.warnings.push('No tokens found to import');
      return result;
    }

    console.log(`Found ${flatTokens.length} tokens to import`);

    // Group tokens by collection
    const tokensByCollection = new Map<string, FlatToken[]>();

    for (const token of flatTokens) {
      const collectionName = options.collectionName || getCollectionName(token.path);

      if (!tokensByCollection.has(collectionName)) {
        tokensByCollection.set(collectionName, []);
      }

      tokensByCollection.get(collectionName)!.push(token);
    }

    // Create/update variables in each collection
    for (const [collectionName, tokens] of tokensByCollection) {
      try {
        // Get or create collection
        const existingCollections = await figma.variables.getLocalVariableCollectionsAsync();
        const existingCollection = existingCollections.find((c) => c.name === collectionName);

        const collection = await getOrCreateCollection(collectionName);

        if (!existingCollection) {
          result.collectionsCreated++;
        }

        // Track existing variables
        const existingVariables = await Promise.all(
          collection.variableIds.map(async (id) => {
            return await figma.variables.getVariableByIdAsync(id);
          })
        );
        const existingVariableNames = new Set(
          existingVariables
            .filter((v): v is Variable => v !== null)
            .map((v) => v.name)
        );

        // Process each token
        for (const token of tokens) {
          try {
            const variableName = options.collectionName
              ? token.path // Use full path if custom collection name
              : getVariableName(token.path);

            const figmaType = getFigmaVariableType(token.type, token.value);
            const figmaValue = convertTokenValue(token.value, figmaType);

            if (figmaValue === null) {
              result.warnings.push(
                `Skipped token ${token.path}: could not convert value`
              );
              continue;
            }

            const wasExisting = existingVariableNames.has(variableName);

            // Use mode-specific function if targetMode is specified
            if (options.targetMode) {
              await setVariableForMode(
                collection,
                variableName,
                figmaType,
                figmaValue,
                options.targetMode,
                token.comment
              );
            } else {
              await setVariable(
                collection,
                variableName,
                figmaType,
                figmaValue,
                token.comment
              );
            }

            if (wasExisting) {
              result.variablesUpdated++;
            } else {
              result.variablesCreated++;
            }
          } catch (error) {
            result.errors.push(
              `Failed to process token ${token.path}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }
      } catch (error) {
        result.errors.push(
          `Failed to process collection ${collectionName}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    result.success = result.errors.length === 0;
  } catch (error) {
    result.success = false;
    result.errors.push(
      `Transform failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    );
  }

  return result;
}

/**
 * Parse and validate Style Dictionary JSON
 */
/**
 * Resolve token references like {token.color.base.red.500.value}
 */
export function resolveTokenReferences(tokens: any, originalTokens?: any): any {
  const rootTokens = originalTokens || tokens;

  if (typeof tokens === 'string') {
    // Check for token reference pattern
    const referenceMatch = tokens.match(/^\{(.+)\}$/);
    if (referenceMatch) {
      const path = referenceMatch[1];

      // Navigate the path in the token structure
      const pathParts = path.split('.');
      let value = rootTokens;

      for (const part of pathParts) {
        if (value && typeof value === 'object' && part in value) {
          value = value[part];
        } else {
          console.warn(`Token reference not found: ${path}`);
          return tokens; // Return original if not found
        }
      }

      // If we found a value, recursively resolve it too
      return resolveTokenReferences(value, rootTokens);
    }

    return tokens;
  }

  if (Array.isArray(tokens)) {
    return tokens.map(item => resolveTokenReferences(item, rootTokens));
  }

  if (typeof tokens === 'object' && tokens !== null) {
    const resolved: any = {};
    for (const [key, value] of Object.entries(tokens)) {
      resolved[key] = resolveTokenReferences(value, rootTokens);
    }
    return resolved;
  }

  return tokens;
}

export function parseStyleDictionary(jsonString: string): StyleDictionaryTokens {
  try {
    let tokens = JSON.parse(jsonString);

    if (!tokens || typeof tokens !== 'object') {
      throw new Error('Invalid token file: expected JSON object');
    }

    // Resolve all token references before processing
    tokens = resolveTokenReferences(tokens);

    return tokens as StyleDictionaryTokens;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
    throw error;
  }
}
