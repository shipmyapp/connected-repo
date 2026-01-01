#!/usr/bin/env node

/**
 * Syncs environment variables from root .env to workspace .env files
 * Only syncs variables that are already defined in the workspace .env files
 */

const fs = require("node:fs");
const path = require("node:path");

// Paths
const ROOT_ENV = path.join(__dirname, "../.env");
const WORKSPACES = [path.join(__dirname, "../apps/backend/.env"), path.join(__dirname, "../apps/frontend/.env")];

/**
 * Parse .env file into key-value object
 */
function parseEnvFile(filePath) {
	if (!fs.existsSync(filePath)) {
		return {};
	}

	const content = fs.readFileSync(filePath, "utf8");
	const env = {};

	content.split("\n").forEach((line) => {
		line = line.trim();

		// Skip empty lines and comments
		if (!line || line.startsWith("#")) {
			return;
		}

		// Parse KEY=VALUE
		const match = line.match(/^([^=]+)=(.*)$/);
		if (match) {
			const key = match[1].trim();
			const value = match[2].trim();
			env[key] = value;
		}
	});

	return env;
}

/**
 * Update workspace .env file with values from root .env
 * Only updates keys that already exist in the workspace file
 */
function syncEnvFile(workspacePath, rootEnv) {
	if (!fs.existsSync(workspacePath)) {
		console.info(`⏭️  Skipping ${path.relative(process.cwd(), workspacePath)} (file doesn't exist)`);
		return;
	}

	const content = fs.readFileSync(workspacePath, "utf8");
	const lines = content.split("\n");
	const updatedLines = [];
	let updatedCount = 0;

	lines.forEach((line) => {
		const trimmed = line.trim();

		// Keep comments and empty lines as-is
		if (!trimmed || trimmed.startsWith("#")) {
			updatedLines.push(line);
			return;
		}

		// Parse KEY=VALUE
		const match = trimmed.match(/^([^=]+)=(.*)$/);
		if (match) {
			const key = match[1].trim();
			const currentValue = match[2].trim();
			
			// If this key exists in root .env, sync it
			if (key in rootEnv) {
				const rootValue = rootEnv[key];
				if (currentValue !== rootValue) {
					updatedLines.push(`${key}=${rootValue}`);
					updatedCount++;
					console.info(`  ✓ Updated ${key}`);
				} else {
					updatedLines.push(line);
				}
			} else {
				// Keep the line as-is if key doesn't exist in root
				updatedLines.push(line);
			}
		} else {
			updatedLines.push(line);
		}
	});

	// Write updated content
	if (updatedCount > 0) {
		fs.writeFileSync(workspacePath, updatedLines.join("\n"));
		console.info(`✅ Synced ${updatedCount} variable(s) to ${path.relative(process.cwd(), workspacePath)}\n`);
	} else {
		console.info(`✓ ${path.relative(process.cwd(), workspacePath)} is up to date\n`);
	}
}

/**
 * Main function
 */
function main() {
	console.info("🔄 Syncing environment variables from root .env...\n");

	// Check if root .env exists
	if (!fs.existsSync(ROOT_ENV)) {
		console.warn("⚠️ Root .env file not found, skipping environment sync");
		process.exit(0);
	}

	// Parse root .env
	const rootEnv = parseEnvFile(ROOT_ENV);
	console.info(`📄 Loaded ${Object.keys(rootEnv).length} variables from root .env\n`);

	// Sync each workspace
	WORKSPACES.forEach((workspacePath) => {
		syncEnvFile(workspacePath, rootEnv);
	});

	console.info("✨ Environment sync complete!");
}

main();
