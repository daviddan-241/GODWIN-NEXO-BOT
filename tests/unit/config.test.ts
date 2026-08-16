/** Configuration layer tests. */
import { describe, it, expect } from 'vitest';
import { loadConfig } from '../../src/config/env';
import { makeConfig, TEST_BOT_TOKEN } from '../helpers/test-env';

const baseEnv = {
  BOT_TOKEN: TEST_BOT_TOKEN,
  ADMIN_IDS: '111, 222',
  WALLET_ENCRYPTION_KEY: 'bb'.repeat(32),
  DATABASE_URL: 'postgres://hfive:hfive@localhost:5432/hfive',
};

describe('config/env', () => {
  it('loads a valid devnet configuration with defaults', () => {
    const config = loadConfig({ ...baseEnv });
    expect(config.SOLANA_NETWORK).toBe('devnet');
    expect(config.rpcUrl).toBe('https://api.devnet.solana.com');
    expect(config.tradingAllowed).toBe(true);
    expect(config.mainnetTradingEnabled).toBe(false);
    expect(config.ADMIN_IDS).toEqual([111, 222]);
    expect(config.telegramApiRoot).toBe('https://api.telegram.org');
    expect(config.appName).toBe('Nexo Snipe');
  });

  it('parses multiple admin IDs and dedupes them', () => {
    const config = loadConfig({ ...baseEnv, ADMIN_IDS: '123456789,987654321,123456789' });
    expect(config.ADMIN_IDS).toEqual([123456789, 987654321]);
  });

  it('accepts ADMIN_CHAT_IDS as a backwards-compatible alias', () => {
    const { ADMIN_IDS: _drop, ...rest } = baseEnv;
    const config = loadConfig({ ...rest, ADMIN_CHAT_IDS: '333,444' });
    expect(config.ADMIN_IDS).toEqual([333, 444]);
  });

  it('fails fast when neither ADMIN_IDS nor ADMIN_CHAT_IDS is set', () => {
    const { ADMIN_IDS: _drop, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(/ADMIN_IDS/);
  });

  it('fails fast when BOT_TOKEN is missing', () => {
    const { BOT_TOKEN: _drop, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(/BOT_TOKEN/);
  });

  it('fails fast when WALLET_ENCRYPTION_KEY is too short', () => {
    expect(() => loadConfig({ ...baseEnv, WALLET_ENCRYPTION_KEY: 'short' })).toThrow(/WALLET_ENCRYPTION_KEY/);
  });

  it('fails fast when DATABASE_URL is missing', () => {
    const { DATABASE_URL: _drop, ...rest } = baseEnv;
    expect(() => loadConfig(rest)).toThrow(/DATABASE_URL/);
  });

  describe('mainnet safety gate', () => {
    it('mainnet + flag off => trading DISABLED', () => {
      const config = loadConfig({ ...baseEnv, SOLANA_NETWORK: 'mainnet', SOLANA_MAINNET_ENABLED: 'false' });
      expect(config.tradingAllowed).toBe(false);
      expect(config.mainnetTradingEnabled).toBe(false);
      expect(config.rpcUrl).toBe('https://api.mainnet-beta.solana.com');
    });

    it('mainnet + flag on => trading ENABLED', () => {
      const config = loadConfig({ ...baseEnv, SOLANA_NETWORK: 'mainnet', SOLANA_MAINNET_ENABLED: 'true' });
      expect(config.tradingAllowed).toBe(true);
      expect(config.mainnetTradingEnabled).toBe(true);
    });

    it('devnet + flag on => still devnet, mainnet NOT enabled', () => {
      const config = loadConfig({ ...baseEnv, SOLANA_NETWORK: 'devnet', SOLANA_MAINNET_ENABLED: 'true' });
      expect(config.tradingAllowed).toBe(true);
      expect(config.mainnetTradingEnabled).toBe(false);
      expect(config.rpcUrl).toContain('devnet');
    });
  });

  it('accepts a custom RPC override', () => {
    const config = loadConfig({ ...baseEnv, SOLANA_RPC_URL: 'https://rpc.example.com/' });
    expect(config.rpcUrl).toBe('https://rpc.example.com/');
  });

  it('rejects an invalid SOLANA_NETWORK value', () => {
    expect(() => loadConfig({ ...baseEnv, SOLANA_NETWORK: 'testnet' })).toThrow();
  });

  it('allows APP_NAME override', () => {
    const config = loadConfig({ ...baseEnv, APP_NAME: 'My Bot' });
    expect(config.appName).toBe('My Bot');
  });

  it('makeConfig helper produces a sane test config', () => {
    const config = makeConfig();
    expect(config.isDevnet).toBe(true);
    expect(config.tradingAllowed).toBe(true);
  });
});
