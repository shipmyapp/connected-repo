/// <reference types="vitest" />
import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
	test: {
		environment: 'node',
		// pool: 'threads',
		globals: true,
		setupFiles: ['./src/test/setup.ts'],
		include: ['src/**/*.{test,spec}.ts'],
		exclude: ['node_modules', 'dist', '**/*.d.ts'],
		coverage: {
			reporter: ['text', 'json', 'html'],
			exclude: [
				'node_modules/',
				'dist/',
				'src/**/*.d.ts',
				'src/test/',
				'**/*.config.ts',
				'src/db/db_script.ts',
			],
		},
	},
	resolve: {
		alias: {
			'@backend': resolve(__dirname, 'src'),
		},
	},
});