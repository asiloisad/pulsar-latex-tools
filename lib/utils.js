"use babel";

const fs = require("fs");
const os = require("os");
const path = require("path");

/**
 * Detect LaTeX engine from magic comment in file header.
 * Scans comment lines at the top of the file for: % !TEX program = <engine>
 * @param {string} filePath - Path to the .tex file
 * @returns {string|null} Engine name (pdflatex, xelatex, lualatex) or null if not found
 */
export function detectEngineFromMagicComment(filePath) {
  try {
    const content = fs.readFileSync(filePath, "utf8");
    const lines = content.split(/\r?\n/);

    for (const line of lines) {
      const trimmed = line.trim();
      // Stop at first non-comment, non-empty line
      if (trimmed && !trimmed.startsWith("%")) {
        break;
      }
      // Check for magic comment: % !TEX program = <engine>
      const match = trimmed.match(/^%\s*!TEX\s+(?:TS-)?program\s*=\s*(\w+)/i);
      if (match) {
        const engine = match[1].toLowerCase();
        if (["pdflatex", "xelatex", "lualatex"].includes(engine)) {
          return engine;
        }
      }
    }
  } catch (error) {
    // File read error - return null
  }
  return null;
}

/**
 * Convert a wildcard pattern to a RegExp.
 * Supports * (any characters) and ? (single character).
 * @param {string} pattern - The wildcard pattern
 * @param {string} baseName - Base name to replace {basename} placeholder
 * @returns {RegExp} The compiled regular expression
 */
export function wildcardToRegex(pattern, baseName) {
  // Replace {basename} placeholder with actual basename
  pattern = pattern.replace(/\{basename\}/g, baseName);

  // Escape special regex characters except * and ?
  let regexPattern = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&");

  // Convert wildcards to regex
  regexPattern = regexPattern.replace(/\*/g, ".*"); // * matches any characters
  regexPattern = regexPattern.replace(/\?/g, "."); // ? matches single character

  // Anchor the pattern to match full filename
  return new RegExp("^" + regexPattern + "$");
}

/**
 * Check if a filename matches a wildcard pattern.
 * @param {string} filename - The filename to test
 * @param {string} pattern - The wildcard pattern
 * @param {string} baseName - Base name for {basename} placeholder
 * @returns {boolean} True if the filename matches the pattern
 */
export function matchesPattern(filename, pattern, baseName) {
  const regex = wildcardToRegex(pattern, baseName);
  return regex.test(filename);
}

/**
 * Get the path to the global latexmkrc configuration file.
 * On Windows, checks both .latexmkrc and latexmkrc (without dot).
 * @returns {string} Path to the latexmkrc file (may not exist yet)
 */
export function getLatexmkrcPath() {
  const homeDir = os.homedir();

  // On Windows, try both .latexmkrc and latexmkrc (without dot)
  const possiblePaths = process.platform === "win32"
    ? [path.join(homeDir, ".latexmkrc"), path.join(homeDir, "latexmkrc")]
    : [path.join(homeDir, ".latexmkrc")];

  // Find existing file or use the first path as default
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return p;
    }
  }

  return possiblePaths[0];
}

/**
 * Create an empty latexmkrc file if it doesn't exist.
 * @param {string} filePath - Path to create the file at
 * @returns {{success: boolean, error?: string}} Result object
 */
export function createLatexmkrc(filePath) {
  if (fs.existsSync(filePath)) {
    return { success: true };
  }

  try {
    fs.writeFileSync(filePath, "", "utf8");
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}
