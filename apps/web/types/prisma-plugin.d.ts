declare module '@prisma/nextjs-monorepo-workaround-plugin' {
  /** Webpack plugin that copies the Prisma query engine next to the bundle. */
  export class PrismaPlugin {
    constructor(options?: Record<string, unknown>);
    apply(compiler: unknown): void;
  }
}
