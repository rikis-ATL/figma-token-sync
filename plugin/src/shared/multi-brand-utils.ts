/**
 * Multi-brand token processing utilities
 */

import { StyleDictionaryTokens } from './types';

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
export function detectMultiBrandStructure(tokenFiles: Array<{path: string}>): MultiBrandStructure {
  const brands = new Map<string, BrandInfo>();
  const globalFiles: string[] = [];
  const baseFiles: string[] = [];

  console.log(`🔍 Analyzing ${tokenFiles.length} token files for multi-brand structure`);

  for (const file of tokenFiles) {
    const path = file.path;
    console.log(`  📄 Analyzing: ${path}`);

    // Look for brand directory patterns
    const brandMatch = path.match(/\/(?:brands?|themes?|variants?)\/([^\/]+)\//);
    if (brandMatch) {
      const brandName = brandMatch[1];
      console.log(`    🏷️  Found brand: ${brandName}`);

      if (!brands.has(brandName)) {
        brands.set(brandName, {
          name: brandName,
          path: brandMatch[0],
          files: []
        });
      }
      brands.get(brandName)!.files.push(path);
    }
    // Look for global token patterns
    else if (path.includes('/global/') || path.includes('global.json') || path.includes('globals.json')) {
      console.log(`    🌐 Found global file: ${path}`);
      globalFiles.push(path);
    }
    // Look for base token patterns
    else if (path.includes('/base/') || path.includes('base.json') || path.includes('/core/') || path.includes('core.json')) {
      console.log(`    🔧 Found base file: ${path}`);
      baseFiles.push(path);
    }
    // Files in root or other directories might be global
    else {
      console.log(`    📝 Treating as global: ${path}`);
      globalFiles.push(path);
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
      // Parse the JSON content
      const tokens = JSON.parse(file.content);

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