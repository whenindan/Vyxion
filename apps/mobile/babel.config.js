module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: [
      // Required by @powersync/react-native for async-iterator watched queries.
      "@babel/plugin-transform-async-generator-functions",
    ],
  };
};
