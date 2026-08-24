import fs from "node:fs";
import path from "node:path";

const traderPath = path.join(process.cwd(), "app/trader/TradingAgent.tsx");
let source = fs.readFileSync(traderPath, "utf8");

const scannerStart = source.indexOf('    const evaluateBots = async () => {');
const scannerEnd = source.indexOf('    void evaluateBots();', scannerStart);
if (scannerStart < 0 || scannerEnd <= scannerStart) throw new Error('DCA accuracy TS fix: final scanner not found.');
let scanner = source.slice(scannerStart, scannerEnd);

if (!scanner.includes('const dcaRequiredCapitalForBot =')) {
  scanner = scanner.replace(
    '    const evaluateBots = async () => {',
    [
      '    const dcaRequiredCapitalForBot = (bot: DcaBot) => {',
      '      let required = bot.baseOrder;',
      '      if (bot.averagingEnabled !== false) {',
      '        const pendingCount = Math.max(0, Math.min(bot.maxSafetyOrders, bot.limitSafetyOrders ?? bot.maxSafetyOrders));',
      '        for (let index = 0; index < pendingCount; index += 1) required += dcaAveragingOrderAmount(bot, index);',
      '      }',
      '      return required;',
      '    };',
      '    const evaluateBots = async () => {',
    ].join('\n')
  );
}

scanner = scanner.replaceAll('availableCapital -= requiredCapitalForNewTrade;', 'availableCapital -= dcaRequiredCapitalForBot(bot);');
if (scanner.includes('availableCapital -= requiredCapitalForNewTrade;')) throw new Error('DCA accuracy TS fix: scoped reservation debit remains.');
if (!scanner.includes('availableCapital -= dcaRequiredCapitalForBot(bot);')) throw new Error('DCA accuracy TS fix: full-reservation debit was not installed.');

source = source.slice(0, scannerStart) + scanner + source.slice(scannerEnd);
fs.writeFileSync(traderPath, source);
console.log('Kept DCA base + active averaging reservation debits in scanner-wide scope.');
