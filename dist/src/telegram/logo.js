"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveLogoPath = resolveLogoPath;
/** Locates the NEXO logo asset across source/compiled layouts. */
const node_fs_1 = __importDefault(require("node:fs"));
const node_path_1 = __importDefault(require("node:path"));
function resolveLogoPath() {
    const candidates = [
        // compiled (dist/src/telegram -> dist/assets) and source (src/telegram -> repo/assets)
        node_path_1.default.resolve(__dirname, '..', '..', 'assets', 'nexo_logo_clean.png'),
        node_path_1.default.resolve(__dirname, '..', '..', 'assets', 'nexo_logo.png'),
    ];
    for (const c of candidates) {
        if (node_fs_1.default.existsSync(c))
            return c;
    }
    return candidates[0];
}
//# sourceMappingURL=logo.js.map