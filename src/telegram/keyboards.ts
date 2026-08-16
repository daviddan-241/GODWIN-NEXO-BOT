/** Inline keyboard builders for the Telegram layer. */
import { InlineKeyboard } from 'grammy';

export function mainMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('📈 Portfolio', 'portfolio:show')
    .text('🪙 Buy', 'buy:start')
    .row()
    .text('💸 Sell', 'sell:start')
    .text('👛 Wallet', 'wallet:show')
    .row()
    .text('📥 Deposit', 'deposit:show')
    .text('📤 Withdraw', 'withdraw:start')
    .row()
    .text('⚙️ Settings', 'settings:show')
    .text('❓ Help', 'help:show');
}

export function backToMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('« Back to menu', 'menu:main');
}

export function confirmCancelKeyboard(confirmData: string): InlineKeyboard {
  return new InlineKeyboard()
    .text('✅ Confirm', confirmData)
    .text('❌ Cancel', 'cancel');
}

export function walletMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🔄 Refresh', 'wallet:refresh')
    .text('📥 Deposit', 'deposit:show')
    .row()
    .text('🔑 Export key', 'wallet:export')
    .text('🆕 New wallet', 'wallet:create')
    .row()
    .text('« Back to menu', 'menu:main');
}

export function buyAmountKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('0.1 SOL', 'buy:amount:0.1')
    .text('0.5 SOL', 'buy:amount:0.5')
    .row()
    .text('1 SOL', 'buy:amount:1')
    .text('❌ Cancel', 'cancel');
}

export function sellPercentKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('25%', 'sell:pct:25')
    .text('50%', 'sell:pct:50')
    .row()
    .text('75%', 'sell:pct:75')
    .text('100%', 'sell:pct:100')
    .row()
    .text('❌ Cancel', 'cancel');
}

export function settingsMenuKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('🎚 Slippage', 'settings:slippage')
    .text('💰 Buy amount', 'settings:buyamount')
    .row()
    .text('⛽ Priority fee', 'settings:priofee')
    .text('« Back to menu', 'menu:main');
}

export function slippageKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('0.5%', 'settings:slippage:50')
    .text('1%', 'settings:slippage:100')
    .row()
    .text('2%', 'settings:slippage:200')
    .text('5%', 'settings:slippage:500')
    .row()
    .text('✍️ Custom…', 'settings:slippage:custom')
    .text('« Back', 'settings:show');
}

export function buyAmountSettingsKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('0.05 SOL', 'settings:buyamount:0.05')
    .text('0.1 SOL', 'settings:buyamount:0.1')
    .row()
    .text('0.5 SOL', 'settings:buyamount:0.5')
    .text('1 SOL', 'settings:buyamount:1')
    .row()
    .text('✍️ Custom…', 'settings:buyamount:custom')
    .text('« Back', 'settings:show');
}

export function priorityFeeKeyboard(): InlineKeyboard {
  return new InlineKeyboard()
    .text('None', 'settings:priofee:0')
    .text('0.0001 SOL', 'settings:priofee:100000')
    .row()
    .text('0.001 SOL', 'settings:priofee:1000000')
    .text('0.005 SOL', 'settings:priofee:5000000')
    .row()
    .text('« Back', 'settings:show');
}

export function withdrawAssetsKeyboard(): InlineKeyboard {
  return new InlineKeyboard().text('◎ SOL', 'withdraw:pick:SOL').text('« Back to menu', 'menu:main');
}
