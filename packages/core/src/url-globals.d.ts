/**
 * The only ambient globals `packages/core` may see.
 *
 * `packages/core` compiles with `lib: ["es2023"]` and `types: []`, so nothing
 * ambient reaches it by default — not the DOM, not Node. That is deliberate:
 * v0.1 is offline by contract, and a package that cannot name `fetch` cannot
 * accidentally call it. The compiler is the guard, not a review habit.
 *
 * `URL` and `URLSearchParams` are the exception, because URL identity cannot be
 * computed without a URL parser and both runtimes core targets — Node and the
 * browser the docs site runs in — provide the same WHATWG one. Adding `dom` or
 * `node` to reach them would hand this package every network global those libs
 * carry, `fetch` included, which is the boundary this declaration exists to
 * keep.
 *
 * What is declared here is only the surface `url.ts` uses, not the full WHATWG
 * API. Widening it is a deliberate act; reaching for a whole lib is not.
 */

declare global {
  interface URLSearchParams {
    get(name: string): string | null;
    sort(): void;
    toString(): string;
  }

  var URLSearchParams: {
    new (init: URLSearchParams): URLSearchParams;
  };

  interface URL {
    readonly protocol: string;
    readonly hostname: string;
    readonly origin: string;
    readonly pathname: string;
    /** The fragment, with its leading `#`, or `''` when there is none. */
    readonly hash: string;
    readonly searchParams: URLSearchParams;
  }

  /** Throws `TypeError` when `input` is not a parseable absolute URL. */
  var URL: {
    new (input: string): URL;
  };
}

export {};
