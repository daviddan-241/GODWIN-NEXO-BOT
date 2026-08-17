"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatMoney = formatMoney;
/** Small shared formatters (kept separate to avoid circular imports). */
function formatMoney(num) {
    if (num >= 1e9)
        return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6)
        return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3)
        return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}
//# sourceMappingURL=formatters.js.map