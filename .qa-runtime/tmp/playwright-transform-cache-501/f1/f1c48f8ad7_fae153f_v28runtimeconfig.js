// 39d6810fbf5ef0fb4662ce3b64a4a8f1e835a4c4
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _test = require("@playwright/test");
var _default = exports.default = (0, _test.defineConfig)({
  testDir: ".",
  testMatch: "v28-qa.spec.ts",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3000"
  }
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdGVzdCIsInJlcXVpcmUiLCJfZGVmYXVsdCIsImV4cG9ydHMiLCJkZWZhdWx0IiwiZGVmaW5lQ29uZmlnIiwidGVzdERpciIsInRlc3RNYXRjaCIsInRpbWVvdXQiLCJ1c2UiLCJiYXNlVVJMIl0sInNvdXJjZXMiOlsidjI4LXJ1bnRpbWUuY29uZmlnLnRzIl0sInNvdXJjZXNDb250ZW50IjpbImltcG9ydHtkZWZpbmVDb25maWd9ZnJvbVwiQHBsYXl3cmlnaHQvdGVzdFwiO2V4cG9ydCBkZWZhdWx0IGRlZmluZUNvbmZpZyh7dGVzdERpcjpcIi5cIix0ZXN0TWF0Y2g6XCJ2MjgtcWEuc3BlYy50c1wiLHRpbWVvdXQ6MzAwMDAsdXNlOntiYXNlVVJMOlwiaHR0cDovL2xvY2FsaG9zdDozMDAwXCJ9fSk7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLEtBQUEsR0FBQUMsT0FBQTtBQUEyQyxJQUFBQyxRQUFBLEdBQUFDLE9BQUEsQ0FBQUMsT0FBQSxHQUFlLElBQUFDLGtCQUFZLEVBQUM7RUFBQ0MsT0FBTyxFQUFDLEdBQUc7RUFBQ0MsU0FBUyxFQUFDLGdCQUFnQjtFQUFDQyxPQUFPLEVBQUMsS0FBSztFQUFDQyxHQUFHLEVBQUM7SUFBQ0MsT0FBTyxFQUFDO0VBQXVCO0FBQUMsQ0FBQyxDQUFDIiwiaWdub3JlTGlzdCI6W119