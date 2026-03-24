/**
 * OtaClaw for OpenClaw - Runtime Configuration
 *
 * This file imports from the config directory.
 * If config.js doesn't exist, it falls back to config.example.js
 */

let config;

try {
  // Try to import user configuration
  const userConfig = await import(`../../config/config.js?v=${Date.now()}`);
  config = userConfig.OTACLAW_CONFIG || userConfig.default;
  console.log("[OtaClaw] Using user configuration from config/config.js");
} catch {
  // Fallback to example configuration with warning
  console.warn("[OtaClaw] User config not found, using example configuration");
  console.warn(
    "[OtaClaw] Please copy config/config.example.js to config/config.js",
  );

  const exampleConfig = await import(`../../config/config.example.js?v=${Date.now()}`);
  config = exampleConfig.OTACLAW_CONFIG || exampleConfig.default;
}

// Ensure we have a valid configuration
if (!config) {
  throw new Error("No configuration found. Please set up config/config.js");
}

export const OTACLAW_CONFIG = config;
export default config;
