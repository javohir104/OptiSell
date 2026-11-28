/**
 * OptiSell Telegram bot — opens the OptiSell web app as a Telegram Mini App.
 * No dependencies: Node 22+ (built-in fetch), long polling.
 *
 *   npm start            (reads .env: BOT_TOKEN, WEBAPP_URL)
 */
import process from 'node:process';

const TOKEN = process.env.BOT_TOKEN?.trim();
const WEBAPP_URL = process.env.WEBAPP_URL?.trim();

if (!TOKEN) {
  console.error('BOT_TOKEN is missing. Copy .env.example to .env and set it.');
  process.exit(1);
}
if (!WEBAPP_URL || !WEBAPP_URL.startsWith('https://')) {
  console.error('WEBAPP_URL must be an https:// address (Telegram only opens Mini Apps over HTTPS).');
  console.error('Local dev: run `npx cloudflared tunnel --url http://localhost:5173` and paste the https://... URL into .env.');
  process.exit(1);
}

const API = `https://api.telegram.org/bot${TOKEN}`;

// Optional: backend address + shared secret, so "Connect Telegram" in OptiSell can link this chat
// for the daily report and low-stock alerts. Same TELEGRAM_LINK_SECRET as in backend/.env.
const BACKEND_URL = (process.env.BACKEND_URL || '').trim().replace(/\/+$/, '');
const LINK_SECRET = (process.env.TELEGRAM_LINK_SECRET || '').trim();

// Support contacts (shown in /help and /support).
const SUPPORT_TG = 'Opti_Sellsupport';
const SUPPORT_PHONE = '+998 (95) 812 50 12';

async function backend(path, body) {
  if (!BACKEND_URL || !LINK_SECRET) throw new Error('not configured');
  const res = await fetch(`${BACKEND_URL}/api/telegram/bot${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Bot-Secret': LINK_SECRET },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error?.message || `HTTP ${res.status}`);
  return data.data;
}

async function call(method, body = {}) {
  const res = await fetch(`${API}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`${method}: ${data.description || res.status}`);
  return data.result;
}

// ---------------------------------------------------------------- texts (uz / ru / en)
const T = {
  uz: {
    open: "🚀 OptiSell'ni ochish",
    menu: 'Ochish',
    help: 'ℹ️ Yordam',
    features: '✨ Imkoniyatlar',
    start: (name) =>
      `Assalomu alaykum, <b>${name}</b>! 👋\n\n` +
      `<b>OptiSell</b> — do'koningiz uchun aqlli boshqaruv tizimi.\n\n` +
      `📦 Mahsulotlar va ombor nazorati\n` +
      `💰 Sotuv va xarajatlarni hisoblash\n` +
      `📊 Foyda va tahlil grafiklari\n\n` +
      `Boshlash uchun pastdagi tugmani bosing 👇`,
    helpText:
      `<b>Qanday foydalaniladi?</b>\n\n` +
      `1️⃣ «OptiSell'ni ochish» tugmasini bosing\n` +
      `2️⃣ Ro'yxatdan o'ting yoki akkauntingizga kiring\n` +
      `3️⃣ Mahsulot qo'shing va sotuvlarni kiriting\n\n` +
      `<b>Buyruqlar</b>\n/start — bosh menyu\n/open — ilovani ochish\n/support — qo'llab-quvvatlash\n/stop — xabarnomalarni o'chirish\n/help — yordam\n\n` +
      `<b>Savol bormi?</b>\n💬 Telegram: @${SUPPORT_TG}\n📞 ${SUPPORT_PHONE}`,
    featuresText:
      `<b>OptiSell imkoniyatlari</b>\n\n` +
      `📊 <b>Boshqaruv paneli</b> — bugungi tushum, foyda va zaxira bir qarashda\n` +
      `📦 <b>Ombor</b> — kam qolgan va ortiqcha tovarlar haqida ogohlantirish\n` +
      `🛒 <b>Sotuvlar</b> — tez kiritish va tarix\n` +
      `🧾 <b>Xarajatlar</b> — ijara, maosh, kommunal\n` +
      `💳 <b>Nasiya</b> — qarz daftari, eslatmalar\n` +
      `🔍 <b>Shtrix-kod</b> — kamera yoki skaner bilan sotuv\n` +
      `🧾 <b>Chek</b> — 58/80 mm printerga chiqarish\n` +
      `👥 <b>Sotuvchilar</b> — xodim akkauntlari\n` +
      `🔔 <b>Telegram hisobot</b> — har kuni kechqurun\n` +
      `📥 <b>Import</b> — CSV fayldan yuklash`,
    openHint: "Ilovani ochish uchun tugmani bosing 👇",
    unknown: "Bu buyruqni tushunmadim. /start ni bosing.",
    description:
      "OptiSell — do'kon uchun ombor, sotuv, xarajat va foyda tahlili.\n\nBoshlash uchun /start ni bosing.",
    short: "Ombor, sotuv va foyda — bitta ilovada.",
    support: `<b>OptiSell qo'llab-quvvatlash</b>\n\n💬 Telegram: @${SUPPORT_TG}\n📞 Telefon: ${SUPPORT_PHONE}\n\nSavolingizni yozing — tez javob beramiz.`,
    writeSupport: '💬 Supportga yozish',
    linked: "✅ Ulandi! Endi hisobot va ogohlantirishlar shu chatga keladi.",
    linkFailed: (e) => `❌ Ulab bo'lmadi: ${e}\n\nOptiSell'da «Telegram'ni ulash» tugmasini qayta bosing.`,
    linkOff: "Bu bot hali OptiSell serveriga ulanmagan. Iltimos, @" + SUPPORT_TG + " ga yozing.",
    stopped: "🔕 Xabarnomalar o'chirildi. Qayta yoqish uchun OptiSell → Profil → Telegram.",
    cmds: [['start', 'Bosh menyu'], ['open', 'Ilovani ochish'], ['support', "Qo'llab-quvvatlash"], ['help', 'Yordam'], ['stop', "Xabarnomalarni o'chirish"]],
  },
  ru: {
    open: '🚀 Открыть OptiSell',
    menu: 'Открыть',
    help: 'ℹ️ Помощь',
    features: '✨ Возможности',
    start: (name) =>
      `Здравствуйте, <b>${name}</b>! 👋\n\n` +
      `<b>OptiSell</b> — умная система управления вашим магазином.\n\n` +
      `📦 Товары и склад\n` +
      `💰 Учёт продаж и расходов\n` +
      `📊 Прибыль и аналитика\n\n` +
      `Нажмите кнопку ниже, чтобы начать 👇`,
    helpText:
      `<b>Как пользоваться?</b>\n\n` +
      `1️⃣ Нажмите «Открыть OptiSell»\n` +
      `2️⃣ Зарегистрируйтесь или войдите\n` +
      `3️⃣ Добавьте товары и вносите продажи\n\n` +
      `<b>Команды</b>\n/start — главное меню\n/open — открыть приложение\n/support — поддержка\n/stop — отключить уведомления\n/help — помощь\n\n` +
      `<b>Есть вопрос?</b>\n💬 Telegram: @${SUPPORT_TG}\n📞 ${SUPPORT_PHONE}`,
    featuresText:
      `<b>Возможности OptiSell</b>\n\n` +
      `📊 <b>Панель</b> — выручка, прибыль и остатки за сегодня\n` +
      `📦 <b>Склад</b> — предупреждения о дефиците и излишках\n` +
      `🛒 <b>Продажи</b> — быстрый ввод и история\n` +
      `🧾 <b>Расходы</b> — аренда, зарплаты, коммуналка\n` +
      `💳 <b>Насия</b> — долговая книга, напоминания\n` +
      `🔍 <b>Штрихкод</b> — продажа через камеру или сканер\n` +
      `🧾 <b>Чек</b> — печать на принтер 58/80 мм\n` +
      `👥 <b>Продавцы</b> — аккаунты сотрудников\n` +
      `🔔 <b>Отчёт в Telegram</b> — каждый вечер\n` +
      `📥 <b>Импорт</b> — загрузка из CSV`,
    openHint: 'Нажмите кнопку, чтобы открыть приложение 👇',
    unknown: 'Не понял команду. Нажмите /start.',
    description:
      'OptiSell — склад, продажи, расходы и аналитика прибыли для магазина.\n\nНажмите /start, чтобы начать.',
    short: 'Склад, продажи и прибыль в одном приложении.',
    support: `<b>Поддержка OptiSell</b>\n\n💬 Telegram: @${SUPPORT_TG}\n📞 Телефон: ${SUPPORT_PHONE}\n\nНапишите ваш вопрос — быстро ответим.`,
    writeSupport: '💬 Написать в поддержку',
    linked: '✅ Подключено! Отчёты и оповещения будут приходить в этот чат.',
    linkFailed: (e) => `❌ Не удалось подключить: ${e}\n\nНажмите «Подключить Telegram» в OptiSell ещё раз.`,
    linkOff: 'Бот ещё не подключён к серверу OptiSell. Напишите @' + SUPPORT_TG + '.',
    stopped: '🔕 Уведомления отключены. Включить снова: OptiSell → Профиль → Telegram.',
    cmds: [['start', 'Главное меню'], ['open', 'Открыть приложение'], ['support', 'Поддержка'], ['help', 'Помощь'], ['stop', 'Отключить уведомления']],
  },
  en: {
    open: '🚀 Open OptiSell',
    menu: 'Open',
    help: 'ℹ️ Help',
    features: '✨ Features',
    start: (name) =>
      `Hi, <b>${name}</b>! 👋\n\n` +
      `<b>OptiSell</b> is a smart management system for your shop.\n\n` +
      `📦 Products & inventory\n` +
      `💰 Sales & expense tracking\n` +
      `📊 Profit analytics\n\n` +
      `Tap the button below to get started 👇`,
    helpText:
      `<b>How to use</b>\n\n` +
      `1️⃣ Tap “Open OptiSell”\n` +
      `2️⃣ Sign up or sign in\n` +
      `3️⃣ Add products and record sales\n\n` +
      `<b>Commands</b>\n/start — main menu\n/open — open the app\n/support — support\n/stop — turn off notifications\n/help — help\n\n` +
      `<b>Questions?</b>\n💬 Telegram: @${SUPPORT_TG}\n📞 ${SUPPORT_PHONE}`,
    featuresText:
      `<b>OptiSell features</b>\n\n` +
      `📊 <b>Dashboard</b> — today's revenue, profit and stock at a glance\n` +
      `📦 <b>Inventory</b> — low-stock and overstock alerts\n` +
      `🛒 <b>Sales</b> — quick entry and history\n` +
      `🧾 <b>Expenses</b> — rent, salaries, utilities\n` +
      `💳 <b>Credit (nasiya)</b> — customer debts and reminders\n` +
      `🔍 <b>Barcodes</b> — sell with the camera or a scanner\n` +
      `🧾 <b>Receipts</b> — print on 58/80 mm printers\n` +
      `👥 <b>Sellers</b> — staff accounts\n` +
      `🔔 <b>Telegram report</b> — every evening\n` +
      `📥 <b>Import</b> — upload from CSV`,
    openHint: 'Tap the button to open the app 👇',
    unknown: "I didn't get that. Tap /start.",
    description:
      'OptiSell — inventory, sales, expenses and profit analytics for your shop.\n\nTap /start to begin.',
    short: 'Inventory, sales and profit in one app.',
    support: `<b>OptiSell support</b>\n\n💬 Telegram: @${SUPPORT_TG}\n📞 Phone: ${SUPPORT_PHONE}\n\nSend us your question — we reply fast.`,
    writeSupport: '💬 Message support',
    linked: '✅ Connected! Reports and alerts will come to this chat.',
    linkFailed: (e) => `❌ Could not connect: ${e}\n\nPress "Connect Telegram" in OptiSell again.`,
    linkOff: 'This bot is not connected to the OptiSell server yet. Please message @' + SUPPORT_TG + '.',
    stopped: '🔕 Notifications turned off. Turn them on again: OptiSell → Profile → Telegram.',
    cmds: [['start', 'Main menu'], ['open', 'Open the app'], ['support', 'Support'], ['help', 'Help'], ['stop', 'Turn off notifications']],
  },
};

const langOf = (user) => {
  const c = user?.language_code || '';
  if (c.startsWith('ru')) return 'ru';
  if (c.startsWith('en')) return 'en';
  return 'uz';
};

const escapeHtml = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);

const openButton = (t) => ({ text: t.open, web_app: { url: WEBAPP_URL } });

const supportButton = (t) => ({ text: t.writeSupport, url: `https://t.me/${SUPPORT_TG}` });

const mainKeyboard = (t) => ({
  inline_keyboard: [
    [openButton(t)],
    [{ text: t.features, callback_data: 'features' }, { text: t.help, callback_data: 'help' }],
    [supportButton(t)],
  ],
});

const backKeyboard = (t) => ({ inline_keyboard: [[openButton(t)], [{ text: '⬅️', callback_data: 'home' }]] });

// ---------------------------------------------------------------- handlers
async function onMessage(msg) {
  const chatId = msg.chat.id;
  const t = T[langOf(msg.from)];
  const text = (msg.text || '').trim();
  const cmd = text.startsWith('/') ? text.split(/[\s@]/)[0].slice(1).toLowerCase() : '';

  // "Connect Telegram" deep link from OptiSell: /start link_<code>
  const linkCode = cmd === 'start' ? /^\/start\s+link_([0-9a-f]{24})$/.exec(text)?.[1] : null;
  if (linkCode) {
    if (!BACKEND_URL || !LINK_SECRET) return call('sendMessage', { chat_id: chatId, text: t.linkOff });
    try {
      await backend('/link', { code: linkCode, chat_id: chatId, language_code: langOf(msg.from) });
      return call('sendMessage', { chat_id: chatId, text: t.linked, reply_markup: { inline_keyboard: [[openButton(t)]] } });
    } catch (e) {
      return call('sendMessage', { chat_id: chatId, text: t.linkFailed(e.message) });
    }
  }
  if (cmd === 'stop') {
    await backend('/unlink', { chat_id: chatId }).catch(() => {});
    return call('sendMessage', { chat_id: chatId, text: t.stopped });
  }
  if (cmd === 'support') {
    return call('sendMessage', { chat_id: chatId, text: t.support, parse_mode: 'HTML', reply_markup: { inline_keyboard: [[supportButton(t)]] } });
  }
  if (cmd === 'start') {
    const name = escapeHtml(msg.from?.first_name || 'do‘st');
    return call('sendMessage', { chat_id: chatId, text: t.start(name), parse_mode: 'HTML', reply_markup: mainKeyboard(t) });
  }
  if (cmd === 'help') {
    return call('sendMessage', { chat_id: chatId, text: t.helpText, parse_mode: 'HTML', reply_markup: backKeyboard(t) });
  }
  if (cmd === 'open' || cmd === 'app') {
    return call('sendMessage', { chat_id: chatId, text: t.openHint, reply_markup: { inline_keyboard: [[openButton(t)]] } });
  }
  if (msg.chat.type === 'private') {
    return call('sendMessage', { chat_id: chatId, text: t.unknown, reply_markup: { inline_keyboard: [[openButton(t)]] } });
  }
  return undefined;
}

async function onCallback(q) {
  const t = T[langOf(q.from)];
  const target = { chat_id: q.message.chat.id, message_id: q.message.message_id, parse_mode: 'HTML' };
  await call('answerCallbackQuery', { callback_query_id: q.id }).catch(() => {});
  const edit = (text, reply_markup) =>
    call('editMessageText', { ...target, text, reply_markup }).catch((e) => {
      if (!String(e.message).includes('message is not modified')) throw e;
    });

  if (q.data === 'help') return edit(t.helpText, backKeyboard(t));
  if (q.data === 'features') return edit(t.featuresText, backKeyboard(t));
  if (q.data === 'home') return edit(t.start(escapeHtml(q.from?.first_name || '')), mainKeyboard(t));
  return undefined;
}

// ---------------------------------------------------------------- one-time bot profile setup
async function setupProfile() {
  for (const [code, t] of Object.entries(T)) {
    const scope = code === 'uz' ? {} : { language_code: code };
    const commands = t.cmds.map(([command, description]) => ({ command, description }));
    await call('setMyCommands', { commands, ...scope });
    await call('setMyDescription', { description: t.description, ...scope }).catch(() => {});
    await call('setMyShortDescription', { short_description: t.short, ...scope }).catch(() => {});
  }
  // The blue "Open" button next to the message field in every private chat.
  await call('setChatMenuButton', { menu_button: { type: 'web_app', text: T.uz.menu, web_app: { url: WEBAPP_URL } } });
}

// ---------------------------------------------------------------- long polling
let offset = 0;
let running = true;

async function poll() {
  while (running) {
    try {
      const updates = await call('getUpdates', { offset, timeout: 30, allowed_updates: ['message', 'callback_query'] });
      for (const u of updates) {
        offset = u.update_id + 1;
        try {
          if (u.message) await onMessage(u.message);
          else if (u.callback_query) await onCallback(u.callback_query);
        } catch (e) {
          console.error('handler error:', e.message);
        }
      }
    } catch (e) {
      console.error('polling error:', e.message);
      await new Promise((r) => setTimeout(r, 3000));
    }
  }
}

const stop = () => { running = false; console.log('\nBot stopped.'); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);

const me = await call('getMe');
await call('deleteWebhook', { drop_pending_updates: false });
await setupProfile();
console.log(`✅ @${me.username} is running`);
console.log(`   Mini App URL: ${WEBAPP_URL}`);
console.log(`   Open https://t.me/${me.username} and send /start`);
console.log(
  BACKEND_URL && LINK_SECRET
    ? `   Account linking: on (${BACKEND_URL}). In backend/.env set TELEGRAM_BOT_USERNAME=${me.username}`
    : '   Account linking: off (set BACKEND_URL and TELEGRAM_LINK_SECRET in .env)',
);
await poll();
