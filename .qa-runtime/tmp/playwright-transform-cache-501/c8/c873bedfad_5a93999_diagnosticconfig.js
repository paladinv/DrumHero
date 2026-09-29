// 412428bbb5d21160a05730619ddec1ccb4deded2
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _test = require("@playwright/test");
var _default = exports.default = (0, _test.defineConfig)({
  testDir: ".",
  testMatch: "diagnostic.spec.ts",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3000"
  }
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdGVzdCIsInJlcXVpcmUiLCJfZGVmYXVsdCIsImV4cG9ydHMiLCJkZWZhdWx0IiwiZGVmaW5lQ29uZmlnIiwidGVzdERpciIsInRlc3RNYXRjaCIsInRpbWVvdXQiLCJ1c2UiLCJiYXNlVVJMIl0sInNvdXJjZXMiOlsiZGlhZ25vc3RpYy5jb25maWcudHMiXSwic291cmNlc0NvbnRlbnQiOlsiaW1wb3J0e2RlZmluZUNvbmZpZ31mcm9tXCJAcGxheXdyaWdodC90ZXN0XCI7ZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHt0ZXN0RGlyOlwiLlwiLHRlc3RNYXRjaDpcImRpYWdub3N0aWMuc3BlYy50c1wiLHRpbWVvdXQ6MzAwMDAsdXNlOntiYXNlVVJMOlwiaHR0cDovL2xvY2FsaG9zdDozMDAwXCJ9fSk7XG4iXSwibWFwcGluZ3MiOiI7Ozs7OztBQUFBLElBQUFBLEtBQUEsR0FBQUMsT0FBQTtBQUEyQyxJQUFBQyxRQUFBLEdBQUFDLE9BQUEsQ0FBQUMsT0FBQSxHQUFlLElBQUFDLGtCQUFZLEVBQUM7RUFBQ0MsT0FBTyxFQUFDLEdBQUc7RUFBQ0MsU0FBUyxFQUFDLG9CQUFvQjtFQUFDQyxPQUFPLEVBQUMsS0FBSztFQUFDQyxHQUFHLEVBQUM7SUFBQ0MsT0FBTyxFQUFDO0VBQXVCO0FBQUMsQ0FBQyxDQUFDIiwiaWdub3JlTGlzdCI6W119