/**
 * Transform Figma variables to Style Dictionary tokens
 */

import {
  getAllVariableCollections,
  getVariablesInCollection,
  rgbaToHex,
} from '../figma-api/variables';
import { StyleDictionaryTokens } from '../../shared/types';

export interface TransformToSDResult {
  success: boolean;
  tokens: { [path: string]: StyleDictionaryTokens };
  variablesProcessed: number;
  collectionsProcessed: number;
  errors: string[];
  warnings: string[];
}

/**
 * Get Style Dictionary type from Figma variable type
 */
function getStyleDictionaryType(figmaType: VariableResolvedDataType): string {
  switch (figmaType) {
    case 'COLOR':
      return 'color';
    case 'FLOAT':
      return 'dimension';
    case 'STRING':
      return 'string';
    case 'BOOLEAN':
      return 'boolean';
    default:
      return 'string';
  }
}

/**
 * Convert Figma variable value to Style Dictionary value
 */
function convertFigmaValue(
  value: VariableValue,
  type: VariableResolvedDataType
): string | number | boolean {
  if (type === 'COLOR' && typeof value === 'object' && 'r' in value) {
    // Convert RGBA to hex
    return rgbaToHex(value as RGBA);
  }

  if (type === 'FLOAT' && typeof value === 'number') {
    return value;
  }

  if (type === 'BOOLEAN' && typeof value === 'boolean') {
    return value;
  }

  if (type === 'STRING' && typeof value === 'string') {
    return value;
  }

  // Fallback: convert to string
  return String(value);
}

/**
 * Build nested token structure from flat path
 */
function setNestedValue(
  obj: any,
  path: string,
  value: any
): void {
  const parts = path.split('/');
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }

  const lastPart = parts[parts.length - 1];
  current[lastPart] = value;
}

/**
 * Get collection name in lowercase (for token path)
 */
function getCollectionKey(collectionName: string): string {
  return collectionName.toLowerCase().replace(/\s+/g, '-');
}

/**
 * Transform all Figma variables to Style Dictionary tokens
 * Groups tokens by collection into separate objects
 */
export function transformFigmaToTokens(options: {
  collectionsToInclude?: string[]; // Filter to specific collections
  organizeByCollection?: boolean; // Create separate token objects per collection
} = {}): TransformToSDResult {
  const result: TransformToSDResult = {
    success: true,
    tokens: {},
    variablesProcessed: 0,
    collectionsProcessed: 0,
    errors: [],
    warnings: [],
  };

  try {
    const collections = getAllVariableCollections();

    if (collections.length === 0) {
      result.warnings.push('No variable collections found in this file');
      return result;
    }

    for (const collectionInfo of collections) {
      // Filter by collection name if specified
      if (
        options.collectionsToInclude &&
        !options.collectionsToInclude.includes(collectionInfo.name)
      ) {
        continue;
      }

      try {
        const collection = figma.variables.getVariableCollectionById(
          collectionInfo.id
        );
        if (!collection) {
          result.errors.push(`Collection ${collectionInfo.name} not found`);
          continue;
        }

        const variables = getVariablesInCollection(collection);

        if (variables.length === 0) {
          result.warnings.push(
            `Collection ${collectionInfo.name} has no variables`
          );
          continue;
        }

        // Create token object for this collection
        const collectionKey = getCollectionKey(collectionInfo.name);
        const collectionTokens: StyleDictionaryTokens = {
          [collectionKey]: {},
        };

        // Process each variable
        for (const variable of variables) {
          try {
            // Get value from default mode
            const defaultModeId = collection.defaultModeId;
            const value = variable.valuesByMode[defaultModeId];

            if (value === undefined) {
              result.warnings.push(
                `Variable ${variable.name} has no value for default mode`
              );
              continue;
            }

            // Convert value
            const sdType = getStyleDictionaryType(variable.resolvedType);
            const sdValue = convertFigmaValue(value, variable.resolvedType);

            // Create token object
            const token: any = {
              value: sdValue,
              type: sdType,
            };

            // Add description if exists
            if (variable.description) {
              token.comment = variable.description;
            }

            // Build nested path: collection/variable/path
            const fullPath = `${collectionKey}/${variable.name}`;
            setNestedValue(collectionTokens, fullPath, token);

            result.variablesProcessed++;
          } catch (error) {
            result.errors.push(
              `Failed to process variable ${variable.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
            );
          }
        }

        // Store tokens for this collection
        if (options.organizeByCollection) {
          // Each collection gets its own file
          result.tokens[`${collectionKey}.json`] = collectionTokens;
        } else {
          // Merge all collections into one token object
          if (!result.tokens['tokens.json']) {
            result.tokens['tokens.json'] = {};
          }
          Object.assign(result.tokens['tokens.json'], collectionTokens);
        }

        result.collectionsProcessed++;
      } catch (error) {
        result.errors.push(
          `Failed to process collection ${collectionInfo.name}: ${error instanceof Error ? error.message : 'Unknown error'}`
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
 * Format tokens as JSON string
 */
export function formatTokensAsJSON(tokens: StyleDictionaryTokens): string {
  return JSON.stringify(tokens, null, 2);
}

/**
 * Generate a summary of changes between old and new tokens
 */
export function generateChangeSummary(
  oldTokens: StyleDictionaryTokens,
  newTokens: StyleDictionaryTokens
): {
  added: string[];
  modified: string[];
  removed: string[];
} {
  const changes = {
    added: [] as string[],
    modified: [] as string[],
    removed: [] as string[],
  };

  // Helper to flatten tokens into paths
  const flattenTokens = (tokens: any, prefix = ''): Map<string, any> => {
    const result = new Map();

    for (const [key, value] of Object.entries(tokens)) {
      const path = prefix ? `${prefix}.${key}` : key;

      if (value && typeof value === 'object' && 'value' in value) {
        // This is a token
        result.set(path, value);
      } else if (value && typeof value === 'object') {
        // This is a group, recurse
        const nested = flattenTokens(value, path);
        nested.forEach((v, k) => result.set(k, v));
      }
    }

    return result;
  };

  const oldFlat = flattenTokens(oldTokens);
  const newFlat = flattenTokens(newTokens);

  // Find added and modified
  newFlat.forEach((newValue, path) => {
    if (!oldFlat.has(path)) {
      changes.added.push(path);
    } else {
      const oldValue = oldFlat.get(path);
      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        changes.modified.push(path);
      }
    }
  });

  // Find removed
  oldFlat.forEach((_, path) => {
    if (!newFlat.has(path)) {
      changes.removed.push(path);
    }
  });

  return changes;
}
