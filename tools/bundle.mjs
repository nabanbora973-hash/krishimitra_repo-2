/* esbuild bundling with one substitution:
   src/js/firebase.js  →  tools/firebase-offline-stub.js
   so the single-file build has no network dependency. */
import * as esbuild from "esbuild";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const stub = path.join(root, "tools", "firebase-offline-stub.js");

const firebaseOffline = {
  name: "firebase-offline",
  setup(build) {
    build.onResolve({ filter: /(^|\/)firebase\.js$/ }, args => {
      // only the app's own module, never a node_modules package
      if (args.path.startsWith(".") || args.importer.includes("/src/js/")) {
        return { path: stub };
      }
      return null;
    });
  },
};

await esbuild.build({
  entryPoints: [path.join(root, "src", "js", "app.js")],
  bundle: true,
  format: "iife",
  target: "es2020",
  minify: true,
  outfile: path.join(root, "offline", "app.bundle.js"),
  plugins: [firebaseOffline],
  logLevel: "warning",
});
