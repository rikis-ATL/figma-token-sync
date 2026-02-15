/**
 * Multi-brand token processing utilities
 */

import { StyleDictionaryTokens } from './types';

/**
 * Robust JSON parser that can handle common JSON issues
 */
function robustParseJSON(content: string, filePath: string): any {
  // First, try normal JSON parsing
  try {
    return JSON.parse(content);
  } catch (initialError) {
    console.warn(`⚠️  Initial JSON parse failed for ${filePath}, attempting recovery...`);
    console.warn(`   Error: ${initialError instanceof Error ? initialError.message : 'Unknown'}`);

    // Try common fixes
    let cleanedContent = content;

    try {
      // Fix 1: Remove trailing commas before closing braces/brackets
      cleanedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
      console.log(`🔧 Applied trailing comma fix for ${filePath}`);

      let result = JSON.parse(cleanedContent);
      console.log(`✅ Fixed trailing commas in ${filePath}`);
      return result;
    } catch (error) {
      // Continue to next fix
    }

    try {
      // Fix 2: Remove comments (// style)
      cleanedContent = content.replace(/\/\/.*$/gm, '');
      cleanedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
      console.log(`🔧 Applied comment removal fix for ${filePath}`);

      let result = JSON.parse(cleanedContent);
      console.log(`✅ Fixed comments in ${filePath}`);
      return result;
    } catch (error) {
      // Continue to next fix
    }

    try {
      // Fix 3: Remove /* */ style comments
      cleanedContent = content.replace(/\/\*[\s\S]*?\*\//g, '');
      cleanedContent = cleanedContent.replace(/,(\s*[}\]])/g, '$1');
      console.log(`🔧 Applied block comment removal fix for ${filePath}`);

      let result = JSON.parse(cleanedContent);
      console.log(`✅ Fixed block comments in ${filePath}`);
      return result;
    } catch (error) {
      // Continue to next fix
    }

    try {
      // Fix 4: Try to find the JSON content if there's extra data at the end
      const lines = content.split('\n');
      let jsonEndIndex = -1;
      let braceCount = 0;
      let inString = false;
      let escapeNext = false;

      // Find where the main JSON object/array ends
      for (let i = 0; i < content.length; i++) {
        const char = content[i];

        if (escapeNext) {
          escapeNext = false;
          continue;
        }

        if (char === '\\') {
          escapeNext = true;
          continue;
        }

        if (char === '"' && !escapeNext) {
          inString = !inString;
          continue;
        }

        if (!inString) {
          if (char === '{' || char === '[') {
            braceCount++;
          } else if (char === '}' || char === ']') {
            braceCount--;
            if (braceCount === 0) {
              jsonEndIndex = i;
              break;
            }
          }
        }
      }

      if (jsonEndIndex > 0) {
        const truncatedContent = content.substring(0, jsonEndIndex + 1);
        console.log(`🔧 Attempting to truncate extra data after position ${jsonEndIndex} for ${filePath}`);

        let result = JSON.parse(truncatedContent);
        console.log(`✅ Fixed by truncating extra data in ${filePath}`);
        return result;
      }
    } catch (error) {
      // Continue to final attempt
    }

    // Final attempt: Show detailed error and throw
    console.error(`❌ All JSON recovery attempts failed for ${filePath}`);
    console.error(`   Original error: ${initialError instanceof Error ? initialError.message : 'Unknown'}`);

    // Show problematic lines around the error
    if (initialError instanceof SyntaxError && initialError.message.includes('line')) {
      const lineMatch = initialError.message.match(/line (\d+)/);
      if (lineMatch) {
        const problemLine = parseInt(lineMatch[1]);
        const lines = content.split('\n');
        const start = Math.max(0, problemLine - 3);
        const end = Math.min(lines.length, problemLine + 2);

        console.error(`   Context around line ${problemLine}:`);
        for (let i = start; i < end; i++) {
          const marker = i === problemLine - 1 ? '>>> ' : '    ';
          console.error(`   ${marker}${i + 1}: ${lines[i]}`);
        }
      }
    }

    throw initialError;
  }
}

export interface BrandInfo {
  name: string;
  path: string;
  files: string[];
}

export interface MultiBrandStructure {
  brands: BrandInfo[];
  globalFiles: string[];
  baseFiles: string[];
}

export interface ProcessedTokenFile {
  path: string;
  content: string;
  tokens: StyleDictionaryTokens;
  brand?: string;
  category: 'base' | 'global' | 'brand';
}

/**
 * Detect if the repository has multi-brand structure
 */
export function detectMultiBrandStructure(
  tokenFiles: Array<{path: string}>,
  brandFolderPattern?: string
): MultiBrandStructure {
  const brands = new Map<string, BrandInfo>();
  const globalFiles: string[] = [];
  const baseFiles: string[] = [];

  console.log(`🔍 Analyzing ${tokenFiles.length} token files for multi-brand structure`);
  console.log(`📋 File paths to analyze:`, tokenFiles.map(f => f.path));

  for (const file of tokenFiles) {
    const path = file.path;
    console.log(`  📄 Analyzing: ${path}`);

    // Look for brand directory patterns - add safety check
    if (!path || typeof path !== 'string') {
      console.error('⚠️  Invalid path provided to detectMultiBrandStructure:', path);
      continue;
    }

    // First check for global/base patterns before checking for brands
    if (path.includes('/globals/') || path.includes('globals.json') || path.includes('/global/') || path.includes('global.json')) {
      console.log(`    🌐 Found global file: ${path}`);
      globalFiles.push(path);
    }
    // Look for base/core/palette token patterns
    else if (path.includes('/base/') || path.includes('base.json') || path.includes('/core/') || path.includes('core.json') || path.includes('/palette/') || path.includes('palette.json')) {
      console.log(`    🔧 Found base file: ${path}`);
      baseFiles.push(path);
    }
    // Then match Style Dictionary multi-brand patterns:
    // 1. /brands/brandName/ or /themes/brandName/ or /variants/brandName/ (or custom pattern)
    // 2. tokens/brandName/category (Style Dictionary format) - but exclude common global/base names
    else {
      // Create regex pattern based on configuration
      const defaultPatterns = ['brands?', 'themes?', 'variants?'];
      const brandPatterns = brandFolderPattern
        ? [brandFolderPattern, ...defaultPatterns]
        : defaultPatterns;

      console.log(`🔍 Using brand folder patterns: ${brandPatterns.join(', ')}`);

      // Build regex dynamically based on patterns
      const brandFolderRegex = new RegExp(`\\/(${brandPatterns.join('|')})\\/([^\\/]+)\\/`);

      let brandMatch = path.match(brandFolderRegex) ||
                       path.match(/\/tokens\/([^\/]+)\//) ||
                       path.match(/^([^\/]+)\/tokens\//) ||
                       path.match(/^tokens\/([^\/]+)\//);

      if (brandMatch) {
        // For brandFolderRegex, brand name is in capture group 2, for others it's group 1
        const brandName = brandMatch[2] || brandMatch[1];

        // Skip common global/base directory names
        const excludedNames = ['globals', 'global', 'base', 'core', 'palette', 'foundation', 'primitives', 'common'];
        if (!excludedNames.includes(brandName.toLowerCase())) {
          console.log(`    🏷️  Found brand: ${brandName}`);

          if (!brands.has(brandName)) {
            brands.set(brandName, {
              name: brandName,
              path: brandMatch[0],
              files: []
            });
          }
          brands.get(brandName)!.files.push(path);
        } else {
          console.log(`    🌐 Treating excluded name "${brandName}" as global: ${path}`);
          globalFiles.push(path);
        }
      }
      // Files in root or other directories might be global
      else {
        console.log(`    📝 Treating as global: ${path}`);
        globalFiles.push(path);
      }
    }
  }

  const result = {
    brands: Array.from(brands.values()),
    globalFiles,
    baseFiles
  };

  console.log(`✅ Multi-brand analysis complete:`);
  console.log(`   Brands: ${result.brands.length} (${result.brands.map(b => b.name).join(', ')})`);
  console.log(`   Global files: ${result.globalFiles.length}`);
  console.log(`   Base files: ${result.baseFiles.length}`);

  return result;
}

/**
 * Check if the structure indicates multi-brand setup
 */
export function isMultiBrand(structure: MultiBrandStructure): boolean {
  return structure.brands.length > 0;
}

/**
 * Get brand names from structure
 */
export function getBrandNames(structure: MultiBrandStructure): string[] {
  return structure.brands.map(brand => brand.name);
}

/**
 * Categorize token files based on multi-brand structure
 */
export function categorizeTokenFiles(
  fileContents: Array<{path: string, content: string, error?: string}>,
  brandStructure: MultiBrandStructure
): ProcessedTokenFile[] {
  const processedFiles: ProcessedTokenFile[] = [];

  for (const file of fileContents) {
    if (file.error) {
      console.warn(`⚠️  Skipping file with error: ${file.path} - ${file.error}`);
      continue;
    }

    try {
      // Debug: Log file info before parsing
      console.log(`🔍 About to parse ${file.path} (${file.content.length} chars)`);
      console.log(`📄 Content preview: ${file.content.substring(0, 100)}...`);

      // Parse the JSON content with robust error recovery
      const tokens = robustParseJSON(file.content, file.path);
      console.log(`✅ Successfully parsed ${file.path}`);

      if (!tokens || typeof tokens !== 'object') {
        console.warn(`⚠️  Invalid token structure in ${file.path}: expected object, got ${typeof tokens}`);
        continue;
      }

      // Determine category and brand
      let category: 'base' | 'global' | 'brand' = 'global';
      let brand: string | undefined;

      // Check if it's a base file
      if (brandStructure.baseFiles.includes(file.path)) {
        category = 'base';
      }
      // Check if it's a brand file
      else {
        const brandInfo = brandStructure.brands.find(b =>
          b.files.includes(file.path)
        );
        if (brandInfo) {
          category = 'brand';
          brand = brandInfo.name;
        }
      }

      processedFiles.push({
        path: file.path,
        content: file.content,
        tokens,
        brand,
        category
      });

      console.log(`📦 Processed ${file.path} as ${category}${brand ? ` (brand: ${brand})` : ''}`);
    } catch (parseError) {
      console.error(`❌ Failed to parse ${file.path}:`, parseError);
    }
  }

  console.log(`✅ Categorized ${processedFiles.length} token files`);
  return processedFiles;
}

/**
 * Merge base and global tokens into a foundation
 */
export function mergeBaseAndGlobalTokens(processedFiles: ProcessedTokenFile[]): StyleDictionaryTokens {
  const merged: StyleDictionaryTokens = {};

  // First merge base files
  const baseFiles = processedFiles.filter(f => f.category === 'base');
  for (const file of baseFiles) {
    deepMerge(merged, file.tokens);
    console.log(`🔧 Merged base file: ${file.path}`);
  }

  // Then merge global files
  const globalFiles = processedFiles.filter(f => f.category === 'global');
  for (const file of globalFiles) {
    deepMerge(merged, file.tokens);
    console.log(`🌐 Merged global file: ${file.path}`);
  }

  console.log(`✅ Base + global merge complete`);
  return merged;
}

/**
 * Create brand-specific token sets
 */
export function createBrandTokenSets(
  processedFiles: ProcessedTokenFile[],
  baseTokens: StyleDictionaryTokens
): Map<string, StyleDictionaryTokens> {
  const brandTokenSets = new Map<string, StyleDictionaryTokens>();

  // Group brand files by brand name
  const brandFiles = processedFiles.filter(f => f.category === 'brand');
  const brandGroups = new Map<string, ProcessedTokenFile[]>();

  for (const file of brandFiles) {
    if (file.brand) {
      if (!brandGroups.has(file.brand)) {
        brandGroups.set(file.brand, []);
      }
      brandGroups.get(file.brand)!.push(file);
    }
  }

  // Create token set for each brand
  for (const [brandName, files] of brandGroups) {
    const brandTokens = deepClone(baseTokens);

    // Merge brand-specific files
    for (const file of files) {
      deepMerge(brandTokens, file.tokens);
      console.log(`🏷️  Merged brand file for ${brandName}: ${file.path}`);
    }

    brandTokenSets.set(brandName, brandTokens);
    console.log(`✅ Brand token set complete for: ${brandName}`);
  }

  return brandTokenSets;
}

/**
 * Deep merge utility
 */
export function deepMerge(target: any, source: any): any {
  for (const key in source) {
    if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
      if (!target[key]) target[key] = {};
      deepMerge(target[key], source[key]);
    } else {
      target[key] = source[key];
    }
  }
  return target;
}

/**
 * Deep clone utility
 */
export function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}