/**
 * Stylesheet side-effect imports.
 *
 * Components that ship their own CSS (React Flow, for one) import it for the
 * bundler's benefit. TypeScript has no opinion about a stylesheet, so declare
 * the shape rather than leaving the import unresolvable.
 */
declare module "*.css";
