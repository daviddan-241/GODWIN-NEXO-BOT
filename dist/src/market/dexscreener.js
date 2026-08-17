"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatTokenInfo = void 0;
exports.formatNumber = formatNumber;
var token_resolver_1 = require("./token-resolver");
Object.defineProperty(exports, "formatTokenInfo", { enumerable: true, get: function () { return token_resolver_1.formatTokenInfo; } });
function formatNumber(num) {
    if (num >= 1e9)
        return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6)
        return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3)
        return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}
//# sourceMappingURL=dexscreener.js.map