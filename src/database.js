// database.js - In-memory + file persistence (ESM)
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let db = {
  users: {},
  wallets: {},
  positions: {},
  sniperSettings: {},
  withdrawals: {},
  transactions: {}
};

function loadDB() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      db = { ...db, ...JSON.parse(raw) };
    }
  } catch (e) {
    console.error('Error loading DB:', e.message);
  }
}

function saveDB() {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
  } catch (e) {
    console.error('Error saving DB:', e.message);
  }
}

loadDB();
setInterval(saveDB, 30000);

function getOrCreateUser(telegramId, username, firstName) {
  if (!db.users[telegramId]) {
    db.users[telegramId] = {
      telegramId,
      username: username || '',
      firstName: firstName || '',
      joinedAt: new Date().toISOString(),
      wallets: [],
      state: null,
      stateData: {}
    };
    saveDB();
  }
  return db.users[telegramId];
}

function getUser(telegramId) {
  return db.users[telegramId] || null;
}

function setUserState(telegramId, state, stateData = {}) {
  if (!db.users[telegramId]) return;
  db.users[telegramId].state = state;
  db.users[telegramId].stateData = stateData;
  saveDB();
}

function clearUserState(telegramId) {
  if (!db.users[telegramId]) return;
  db.users[telegramId].state = null;
  db.users[telegramId].stateData = {};
  saveDB();
}

function getAllUsers() {
  return Object.values(db.users);
}

function getUserCount() {
  return Object.keys(db.users).length;
}

function addWallet(telegramId, walletData) {
  if (!db.users[telegramId]) return;
  const walletId = `wallet_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  walletData.id = walletId;
  walletData.addedAt = new Date().toISOString();
  db.users[telegramId].wallets.push(walletData);
  db.wallets[walletData.address] = { ...walletData, telegramId };
  saveDB();
  return walletData;
}

function getUserWallets(telegramId) {
  return (db.users[telegramId] && db.users[telegramId].wallets) || [];
}

function getWalletByAddress(address) {
  return db.wallets[address] || null;
}

function removeWallet(telegramId, walletAddress) {
  if (!db.users[telegramId]) return;
  db.users[telegramId].wallets = db.users[telegramId].wallets.filter(
    w => w.address !== walletAddress
  );
  delete db.wallets[walletAddress];
  saveDB();
}

function getDefaultSniperSettings() {
  return {
    status: 'STANDBY',
    positionSize: 10,
    maxDevHold: 20,
    slippage: 10,
    priorityFee: 0.001,
    takeProfit: 100,
    stopLoss: 30,
    antiRug: true
  };
}

function getSniperSettings(telegramId) {
  if (!db.sniperSettings[telegramId]) {
    db.sniperSettings[telegramId] = getDefaultSniperSettings();
    saveDB();
  }
  return db.sniperSettings[telegramId];
}

function updateSniperSettings(telegramId, updates) {
  if (!db.sniperSettings[telegramId]) {
    db.sniperSettings[telegramId] = getDefaultSniperSettings();
  }
  Object.assign(db.sniperSettings[telegramId], updates);
  saveDB();
  return db.sniperSettings[telegramId];
}

function addPosition(telegramId, position) {
  if (!db.positions[telegramId]) {
    db.positions[telegramId] = [];
  }
  position.id = `pos_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  position.openedAt = new Date().toISOString();
  db.positions[telegramId].push(position);
  saveDB();
  return position;
}

function getPositions(telegramId) {
  return (db.positions[telegramId] || []).filter(p => p.status === 'open');
}

function closePosition(telegramId, positionId) {
  if (!db.positions[telegramId]) return;
  const pos = db.positions[telegramId].find(p => p.id === positionId);
  if (pos) {
    pos.status = 'closed';
    pos.closedAt = new Date().toISOString();
    saveDB();
  }
  return pos;
}

function addWithdrawal(telegramId, withdrawal) {
  const id = `wd_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  withdrawal.id = id;
  withdrawal.telegramId = telegramId;
  withdrawal.status = 'pending';
  withdrawal.requestedAt = new Date().toISOString();
  db.withdrawals[id] = withdrawal;
  saveDB();
  return withdrawal;
}

function getWithdrawal(id) {
  return db.withdrawals[id] || null;
}

function addTransaction(telegramId, tx) {
  const id = `tx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
  tx.id = id;
  tx.telegramId = telegramId;
  tx.timestamp = new Date().toISOString();
  db.transactions[id] = tx;
  saveDB();
  return tx;
}

function getTransactions(telegramId) {
  return Object.values(db.transactions)
    .filter(t => t.telegramId === telegramId)
    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
}

export {
  getOrCreateUser,
  getUser,
  setUserState,
  clearUserState,
  getAllUsers,
  getUserCount,
  addWallet,
  getUserWallets,
  getWalletByAddress,
  removeWallet,
  getSniperSettings,
  updateSniperSettings,
  getDefaultSniperSettings,
  addPosition,
  getPositions,
  closePosition,
  addWithdrawal,
  getWithdrawal,
  addTransaction,
  getTransactions,
  saveDB
};

export default {
  getOrCreateUser,
  getUser,
  setUserState,
  clearUserState,
  getAllUsers,
  getUserCount,
  addWallet,
  getUserWallets,
  getWalletByAddress,
  removeWallet,
  getSniperSettings,
  updateSniperSettings,
  getDefaultSniperSettings,
  addPosition,
  getPositions,
  closePosition,
  addWithdrawal,
  getWithdrawal,
  addTransaction,
  getTransactions,
  saveDB
};
