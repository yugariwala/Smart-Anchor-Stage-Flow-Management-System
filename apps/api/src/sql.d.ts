// wrangler / the Workers vitest pool import .sql files as raw text.
declare module '*.sql' {
  const content: string;
  export default content;
}
