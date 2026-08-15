// solana.js - Real Solana blockchain integration
const { 
  Connection, 
  PublicKey, 
  Keypair, 
  LAMPORTS_PER_SOL,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction
} = require('@solana/web3.js');
const bs58 = require('bs58').default || require('bs58');
const bip39 = require('bip39');
const { derivePath } = require('ed25519-hd-key');

const RPC_URL = process.env.SOLANA_RPC_URL || 'https://api.mainnet-beta.solana.com';
let connection = null;

function getConnection() {
  if (!connection) {
    connection = new Connection(RPC_URL, 'confirmed');
  }
  return connection;
}

// Generate a new Solana wallet
function generateWallet() {
  const keypair = Keypair.generate();
  const publicKey = keypair.publicKey.toString();
  const secretKey = bs58.encode(keypair.secretKey);
  const seedPhrase = bip39.generateMnemonic(128); // 12-word seed
  
  return {
    address: publicKey,
    privateKey: secretKey,
    seedPhrase: seedPhrase,
    keypair: keypair
  };
}

// Import wallet from private key (base58)
function importFromPrivateKey(privateKeyB58) {
  try {
    const secretKey = bs58.decode(privateKeyB58.trim());
    const keypair = Keypair.fromSecretKey(secretKey);
    return {
      address: keypair.publicKey.toString(),
      privateKey: privateKeyB58.trim(),
      keypair: keypair,
      seedPhrase: null
    };
  } catch (error) {
    return null;
  }
}

// Import wallet from seed phrase
async function importFromSeed(seedPhrase) {
  try {
    const seed = await bip39.mnemonicToSeed(seedPhrase.trim());
    const derivePath = "m/44'/501'/0'/0'";
    const derived = derivePath(derivePath, seed);
    const keypair = Keypair.fromSeed(derived.key);
    return {
      address: keypair.publicKey.toString(),
      privateKey: bs58.encode(keypair.secretKey),
      seedPhrase: seedPhrase.trim(),
      keypair: keypair
    };
  } catch (error) {
    return null;
  }
}

// Get real SOL balance
async function getBalance(address) {
  try {
    const conn = getConnection();
    const pubKey = new PublicKey(address);
    const balance = await conn.getBalance(pubKey);
    return balance / LAMPORTS_PER_SOL;
  } catch (error) {
    console.error('Balance check error:', error.message);
    return 0;
  }
}

// Get all wallet balances for a user
async function getAllBalances(wallets) {
  const results = [];
  for (const wallet of wallets) {
    const balance = await getBalance(wallet.address);
    results.push({ ...wallet, balance });
  }
  return results;
}

// Send real SOL transaction
async function sendSol(fromKeypair, toAddress, amountSol) {
  try {
    const conn = getConnection();
    const toPubKey = new PublicKey(toAddress);
    const lamports = Math.floor(amountSol * LAMPORTS_PER_SOL);
    
    const transaction = new Transaction().add(
      SystemProgram.transfer({
        fromPubkey: fromKeypair.publicKey,
        toPubkey: toPubKey,
        lamports: lamports
      })
    );
    
    const signature = await sendAndConfirmTransaction(conn, transaction, [fromKeypair]);
    return { success: true, signature };
  } catch (error) {
    console.error('Send error:', error.message);
    return { success: false, error: error.message };
  }
}

// Check for new deposits (polling)
async function checkDeposits(address, lastKnownBalance) {
  const currentBalance = await getBalance(address);
  if (currentBalance > lastKnownBalance) {
    const diff = currentBalance - lastKnownBalance;
    return { hasDeposit: true, amount: diff, newBalance: currentBalance };
  }
  return { hasDeposit: false, newBalance: currentBalance };
}

// Validate a Solana address
function isValidAddress(address) {
  try {
    new PublicKey(address.trim());
    return true;
  } catch {
    return false;
  }
}

// Validate base58 private key
function isValidPrivateKey(key) {
  try {
    const decoded = bs58.decode(key.trim());
    return decoded.length === 64;
  } catch {
    return false;
  }
}

// Get transaction history
async function getTransactionHistory(address, limit = 10) {
  try {
    const conn = getConnection();
    const pubKey = new PublicKey(address);
    const signatures = await conn.getSignaturesForAddress(pubKey, { limit });
    return signatures.map(s => ({
      signature: s.signature,
      slot: s.slot,
      blockTime: s.blockTime,
      err: s.err
    }));
  } catch (error) {
    return [];
  }
}

module.exports = {
  getConnection,
  generateWallet,
  importFromPrivateKey,
  importFromSeed,
  getBalance,
  getAllBalances,
  sendSol,
  checkDeposits,
  isValidAddress,
  isValidPrivateKey,
  getTransactionHistory,
  LAMPORTS_PER_SOL
};
