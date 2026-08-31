// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    rules: {
      // Fetch-on-mount via useEffect é o padrão usado nas telas deste app
      // (sem camada de data-fetching própria) — não é bug aqui.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  {
    ignores: ["dist/*"],
  },
]);
