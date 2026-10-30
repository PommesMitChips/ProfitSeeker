const path = require("node:path"),
  fs = require("node:fs");
module.exports = {
  entry: "./harness/main.tsx",
  target: "web",
  devtool: false,
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: {
          loader: "ts-loader",
          options: { compilerOptions: { noEmit: false, module: "ESNext" } },
        },
        exclude: /node_modules/,
      },
    ],
  },
  resolve: { extensions: [".tsx", ".ts", ".js"] },
  output: {
    filename: "harness.js",
    path: path.resolve(__dirname, "tmp/harness"),
    clean: true,
  },
  plugins: [
    {
      apply(compiler) {
        compiler.hooks.afterEmit.tap("HarnessPage", () =>
          fs.copyFileSync(
            path.join(__dirname, "harness/index.html"),
            path.join(__dirname, "tmp/harness/index.html"),
          ),
        );
      },
    },
  ],
};
