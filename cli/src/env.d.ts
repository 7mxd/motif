declare module "*VERSION" {
  const text: string;
  export default text;
}
declare module "*.css" {
  const text: string;
  export default text;
}
declare module "*.html" {
  const text: string;
  export default text;
}
declare module "*.md" {
  const text: string;
  export default text;
}
declare module "*.json" {
  const text: string;
  export default text;
}

declare module "*.woff2" {
  /** A path Bun.file() can read, in the source tree or inside the compiled tool. */
  const path: string;
  export default path;
}

declare module "*.dart" {
  const text: string;
  export default text;
}

declare module "*.kt" {
  const text: string;
  export default text;
}

declare module "*.gradle" {
  const text: string;
  export default text;
}

declare module "*.swift" {
  const text: string;
  export default text;
}

declare module "*.xcscheme" {
  const text: string;
  export default text;
}
