import { z } from "zod";

/**
 * Env primitives shared by every Vite app (frontend, superadmin). A blank
 * value means "unset": Docker build args and Dokploy fields arrive as ""
 * when left empty, and a blank optional key must build, not fail
 * validation (a blank VITE_TEST_PASSWORD once broke the
 * production image build).
 */
export const blankAsUndefined = (val: unknown): unknown => (val === "" ? undefined : val);

export const optionalString = z.preprocess(blankAsUndefined, z.string().optional());

export const optionalUrl = z.preprocess(blankAsUndefined, z.url().optional());

/** A rate between 0 and 1 (Sentry sampling); blank keeps the code's default. */
export const optionalSampleRate = z.preprocess(
	(val) => (val === "" || val === undefined ? undefined : Number(val)),
	z.number().min(0).max(1).optional(),
);
