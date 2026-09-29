// 91d423be04e2c7b29770afe6fad07b334b2cb250
"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.default = void 0;
var _test = require("@playwright/test");
var _default = exports.default = (0, _test.defineConfig)({
  testDir: ".",
  testMatch: "recapture.spec.ts",
  timeout: 30000,
  use: {
    baseURL: "http://localhost:3000"
  }
});
//# sourceMappingURL=data:application/json;charset=utf-8;base64,eyJ2ZXJzaW9uIjozLCJuYW1lcyI6WyJfdGVzdCIsInJlcXVpcmUiLCJfZGVmYXVsdCIsImV4cG9ydHMiLCJkZWZhdWx0IiwiZGVmaW5lQ29uZmlnIiwidGVzdERpciIsInRlc3RNYXRjaCIsInRpbWVvdXQiLCJ1c2UiLCJiYXNlVVJMIl0sInNvdXJjZXMiOlsicmVjYXB0dXJlLmNvbmZpZy50cyJdLCJzb3VyY2VzQ29udGVudCI6WyJpbXBvcnQgeyBkZWZpbmVDb25maWcgfSBmcm9tIFwiQHBsYXl3cmlnaHQvdGVzdFwiO1xuZXhwb3J0IGRlZmF1bHQgZGVmaW5lQ29uZmlnKHsgdGVzdERpcjogXCIuXCIsIHRlc3RNYXRjaDogXCJyZWNhcHR1cmUuc3BlYy50c1wiLCB0aW1lb3V0OiAzMDAwMCwgdXNlOiB7IGJhc2VVUkw6IFwiaHR0cDovL2xvY2FsaG9zdDozMDAwXCIgfSB9KTtcbiJdLCJtYXBwaW5ncyI6Ijs7Ozs7O0FBQUEsSUFBQUEsS0FBQSxHQUFBQyxPQUFBO0FBQWdELElBQUFDLFFBQUEsR0FBQUMsT0FBQSxDQUFBQyxPQUFBLEdBQ2pDLElBQUFDLGtCQUFZLEVBQUM7RUFBRUMsT0FBTyxFQUFFLEdBQUc7RUFBRUMsU0FBUyxFQUFFLG1CQUFtQjtFQUFFQyxPQUFPLEVBQUUsS0FBSztFQUFFQyxHQUFHLEVBQUU7SUFBRUMsT0FBTyxFQUFFO0VBQXdCO0FBQUUsQ0FBQyxDQUFDIiwiaWdub3JlTGlzdCI6W119