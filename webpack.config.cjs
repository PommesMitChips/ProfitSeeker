const path = require("node:path");
module.exports = {
  entry: "./src/mod.tsx",
  target: "web",
  devtool: false,
  externals: {
    react: "React",
    "react-dom": "ReactDOM",
    "react-dom/client": "ReactDOM",
    "@mui/material": "MaterialUI",
  },
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
    filename: "mod.js",
    path: path.resolve(__dirname, "dist/afnm-profitseeker"),
    library: { name: "AFNMMod", type: "umd", export: "default" },
    globalObject: "this",
    publicPath: "mod://",
    clean: true,
  },
};
