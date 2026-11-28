import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowRight, BarChart3, Barcode, Bell, Check, ChevronDown, ClipboardCheck, FileSpreadsheet, Gift, HandCoins, Headphones, Moon,
  Package, Phone, Printer, Send, ShoppingCart, Sparkles, Sun, Truck, Users, WifiOff,
} from 'lucide-react';
import Logo from '../components/layout/Logo';
import LanguageSwitcher from '../components/common/LanguageSwitcher';
import { useI18n } from '../i18n';
import { useTheme } from '../context/ThemeContext';
import { SUPPORT } from '../config/support';
import { PLANS } from '../utils/plans';
import { formatMoney } from '../utils/format';
import { openLink } from '../telegram';
import { cn } from '../utils/cn';

/** Landing texts live here (only this page uses them): uz / ru / en. */
const TX = {
  uz: {
    login: 'Kirish', start: 'Bepul boshlash', more: 'Imkoniyatlar',
    badge: "O'zbekistondagi do'konlar uchun",
    h1a: "Do'koningizni", h1b: 'aqlli boshqaring',
    sub: "Ombor, sotuv, nasiya, xarajat va foyda — bitta ilovada. Telefonda, kompyuterda va Telegram'da ishlaydi.",
    trial: "Birinchi oy Pro tekin · Karta kerak emas",
    stats: [['12+', 'ta asosiy modul'], ['3', 'til: uz · ru · en'], ['24/7', 'oflayn sotuv ham']],
    fTitle: 'Do\'kon uchun hamma narsa', fSub: "Kassadan tortib buxgalteriya hisobotigacha.",
    features: [
      [ShoppingCart, 'Tez sotuv', "Savatcha, chegirma, bir nechta mahsulot, chek chiqarish."],
      [Barcode, 'Shtrix-kod', "Kamera yoki USB skaner bilan bir zumda topish."],
      [HandCoins, 'Nasiya daftari', "Kim qancha qarz, muddati, SMS eslatma."],
      [Package, 'Ombor', "Kam qolgan tovar ogohlantirishi, kg/litrda sotish."],
      [Truck, 'Yetkazib beruvchilar', "Kirim, tannarx va yetkazib beruvchiga qarz."],
      [ClipboardCheck, 'Inventarizatsiya', "Skaner bilan sanash, kamomadni ko'rish."],
      [BarChart3, 'Foyda tahlili', "Tushum, tannarx, xarajat va sof foyda."],
      [Sparkles, 'Prognoz', "Qaysi tovar qachon tugashini oldindan biling."],
      [Users, 'Sotuvchilar', "Xodim akkauntlari — foyda va tannarxni ko'rmaydi."],
      [Bell, 'Telegram hisobot', "Har kuni kechqurun natijalar botga keladi."],
      [FileSpreadsheet, 'Excel hisobotlar', "Bir tugma bilan buxgalterga tayyor fayl."],
      [WifiOff, 'Oflayn rejim', "Internet uzilsa ham sotuv yo'qolmaydi."],
    ],
    howTitle: '3 qadamda boshlang',
    how: [["Ro'yxatdan o'ting", '1 daqiqa, Google bilan ham bo\'ladi.'], ["Mahsulot qo'shing", "Qo'lda, Excel'dan yoki skaner bilan."], ['Soting va kuzating', "Foyda va qoldiq o'zi hisoblanadi."]],
    pTitle: 'Tariflar', pSub: "Kichik do'kondan katta savdo nuqtasigacha.", perMonth: '/ oy', choose: 'Boshlash',
    plans: {
      free: ['15 tagacha mahsulot', 'Sotuv va ombor', 'Shtrix-kod va chek', 'Oflayn rejim'],
      pro: ['35 tagacha mahsulot', 'Xarajatlar va tahlil', 'Nasiya daftari', 'Yetkazib beruvchilar', 'Excel hisobotlar'],
      max: ['Cheksiz mahsulot', "Pro'dagi hammasi", '10 tagacha sotuvchi', 'Telegram kunlik hisobot', "Kam qolgan tovar haqida xabar"],
    },
    popular: 'Ommabop',
    bTitle: "Do'stlaringizni taklif qiling — tarifni ballarga oling",
    bText: "Taklif qilgan do'stingiz do'kon ochsa +15, Pro olsa +30, Max olsa +50 ball. Kunlik tushum 1,5 mln dan oshsa +10. 399 ball = Pro, 699 ball = Max.",
    qTitle: 'Savollar',
    faq: [
      ["Internet bo'lmasa ishlaydimi?", "Ha. Sotuvlar qurilmada saqlanadi va internet qaytganda avtomatik yuboriladi."],
      ["Telegram'da ishlaydimi?", "Ha, OptiSell Telegram Mini App sifatida ham ochiladi — alohida dastur o'rnatish shart emas."],
      ["Ma'lumotlarim xavfsizmi?", "Har kuni avtomatik zaxira nusxa olinadi, sotuvchilar esa tannarx va foydani ko'rmaydi."],
      ["Kilogrammda sotsa bo'ladimi?", "Ha, kg, litr va metrda kasr miqdor bilan sotish mumkin (masalan 0,75 kg)."],
    ],
    cta: "Bugunoq boshlang — birinchi oy Pro tekin", support: "Qo'llab-quvvatlash",
  },
  ru: {
    login: 'Войти', start: 'Начать бесплатно', more: 'Возможности',
    badge: 'Для магазинов Узбекистана',
    h1a: 'Управляйте магазином', h1b: 'умно',
    sub: 'Склад, продажи, долги, расходы и прибыль — в одном приложении. Работает на телефоне, компьютере и в Telegram.',
    trial: 'Первый месяц Pro бесплатно · Без карты',
    stats: [['12+', 'основных модулей'], ['3', 'языка: uz · ru · en'], ['24/7', 'даже офлайн']],
    fTitle: 'Всё для магазина', fSub: 'От кассы до отчёта для бухгалтера.',
    features: [
      [ShoppingCart, 'Быстрая продажа', 'Корзина, скидки, несколько товаров, чек.'],
      [Barcode, 'Штрихкод', 'Камера или USB-сканер — товар за секунду.'],
      [HandCoins, 'Насия (долги)', 'Кто сколько должен, сроки, напоминания.'],
      [Package, 'Склад', 'Оповещения о нехватке, продажа на кг/литры.'],
      [Truck, 'Поставщики', 'Поступления, себестоимость, долги поставщикам.'],
      [ClipboardCheck, 'Инвентаризация', 'Пересчёт сканером, видна недостача.'],
      [BarChart3, 'Анализ прибыли', 'Выручка, себестоимость, расходы, чистая прибыль.'],
      [Sparkles, 'Прогноз', 'Узнайте заранее, когда закончится товар.'],
      [Users, 'Продавцы', 'Аккаунты сотрудников без доступа к прибыли.'],
      [Bell, 'Отчёт в Telegram', 'Каждый вечер итоги дня в боте.'],
      [FileSpreadsheet, 'Отчёты Excel', 'Файл для бухгалтера в один клик.'],
      [WifiOff, 'Офлайн-режим', 'Нет интернета — продажи не теряются.'],
    ],
    howTitle: 'Начните за 3 шага',
    how: [['Зарегистрируйтесь', '1 минута, можно через Google.'], ['Добавьте товары', 'Вручную, из Excel или сканером.'], ['Продавайте и следите', 'Прибыль и остатки считаются сами.']],
    pTitle: 'Тарифы', pSub: 'От маленького магазина до крупной точки.', perMonth: '/ мес', choose: 'Начать',
    plans: {
      free: ['До 15 товаров', 'Продажи и склад', 'Штрихкод и чеки', 'Офлайн-режим'],
      pro: ['До 35 товаров', 'Расходы и аналитика', 'Насия (долги)', 'Поставщики', 'Отчёты Excel'],
      max: ['Без ограничений', 'Всё из Pro', 'До 10 продавцов', 'Отчёт в Telegram', 'Оповещения о нехватке'],
    },
    popular: 'Популярный',
    bTitle: 'Приглашайте друзей — оплачивайте тариф баллами',
    bText: 'Друг открыл магазин +15, купил Pro +30, Max +50 баллов. Выручка за день больше 1,5 млн +10. 399 баллов = Pro, 699 = Max.',
    qTitle: 'Вопросы',
    faq: [
      ['Работает без интернета?', 'Да. Продажи сохраняются на устройстве и отправляются, когда интернет появится.'],
      ['Работает в Telegram?', 'Да, OptiSell открывается как Telegram Mini App — ничего устанавливать не нужно.'],
      ['Мои данные в безопасности?', 'Каждый день делается резервная копия, а продавцы не видят себестоимость и прибыль.'],
      ['Можно продавать на кг?', 'Да, в кг, литрах и метрах — дробное количество (например 0,75 кг).'],
    ],
    cta: 'Начните сегодня — первый месяц Pro бесплатно', support: 'Поддержка',
  },
  en: {
    login: 'Sign in', start: 'Start free', more: 'Features',
    badge: 'Built for shops in Uzbekistan',
    h1a: 'Run your shop', h1b: 'the smart way',
    sub: 'Stock, sales, customer credit, expenses and profit — in one app. Works on phone, desktop and Telegram.',
    trial: 'First month of Pro free · No card needed',
    stats: [['12+', 'core modules'], ['3', 'languages: uz · ru · en'], ['24/7', 'even offline']],
    fTitle: 'Everything a shop needs', fSub: 'From the till to the accountant\'s report.',
    features: [
      [ShoppingCart, 'Fast checkout', 'Cart, discounts, many items, receipts.'],
      [Barcode, 'Barcodes', 'Camera or USB scanner — found instantly.'],
      [HandCoins, 'Credit book', 'Who owes what, due dates, reminders.'],
      [Package, 'Inventory', 'Low-stock alerts, sell by kg or litre.'],
      [Truck, 'Suppliers', 'Arrivals, cost prices, what you owe.'],
      [ClipboardCheck, 'Stock-take', 'Count with the scanner, see shortages.'],
      [BarChart3, 'Profit analytics', 'Revenue, costs, expenses, net profit.'],
      [Sparkles, 'Forecast', 'Know in advance when a product runs out.'],
      [Users, 'Sellers', 'Staff accounts without access to profit.'],
      [Bell, 'Telegram report', 'The day\'s results in the bot every evening.'],
      [FileSpreadsheet, 'Excel reports', 'A file for the accountant in one click.'],
      [WifiOff, 'Offline mode', 'No internet — no lost sales.'],
    ],
    howTitle: 'Start in 3 steps',
    how: [['Sign up', '1 minute, Google works too.'], ['Add products', 'By hand, from Excel or with a scanner.'], ['Sell and watch', 'Profit and stock are counted for you.']],
    pTitle: 'Pricing', pSub: 'From a small shop to a busy store.', perMonth: '/ mo', choose: 'Get started',
    plans: {
      free: ['Up to 15 products', 'Sales and inventory', 'Barcodes and receipts', 'Offline mode'],
      pro: ['Up to 35 products', 'Expenses and analytics', 'Credit book', 'Suppliers', 'Excel reports'],
      max: ['Unlimited products', 'Everything in Pro', 'Up to 10 sellers', 'Telegram daily report', 'Low-stock alerts'],
    },
    popular: 'Popular',
    bTitle: 'Invite friends — pay for your plan with points',
    bText: 'Friend opens a shop +15, buys Pro +30, Max +50 points. Daily revenue over 1.5 mln +10. 399 points = Pro, 699 = Max.',
    qTitle: 'Questions',
    faq: [
      ['Does it work without internet?', 'Yes. Sales are saved on the device and sent when the connection is back.'],
      ['Does it work in Telegram?', 'Yes, OptiSell opens as a Telegram Mini App — nothing to install.'],
      ['Is my data safe?', 'A backup is made every day, and sellers never see cost prices or profit.'],
      ['Can I sell by the kilo?', 'Yes, in kg, litres and metres with fractions (e.g. 0.75 kg).'],
    ],
    cta: 'Start today — first month of Pro free', support: 'Support',
  },
};

const fade = (delay = 0) => ({
  initial: { opacity: 0, y: 24 }, whileInView: { opacity: 1, y: 0 }, viewport: { once: true, margin: '-60px' },
  transition: { duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] },
});

function HeroMock() {
  const bars = [30, 48, 40, 62, 55, 78, 70, 92, 84, 100];
  return (
    <motion.div className="relative mx-auto w-full max-w-md" initial={{ opacity: 0, y: 40, rotateX: 15 }} animate={{ opacity: 1, y: 0, rotateX: 0 }}
      transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} style={{ perspective: 1000 }}>
      <div className="absolute -inset-6 rounded-[2rem] bg-gradient-to-tr from-brand-500/30 via-emerald-400/20 to-teal-400/30 blur-2xl" />
      <motion.div className="relative rounded-2xl border border-zinc-200 bg-white p-5 shadow-pop dark:border-zinc-800 dark:bg-zinc-900"
        animate={{ y: [0, -8, 0] }} transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}>
        <div className="mb-4 flex items-center justify-between"><Logo /><span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400">+24%</span></div>
        <div className="grid grid-cols-3 gap-2">
          {[['Tushum', '12,4 mln'], ['Foyda', '3,1 mln'], ['Sotuv', '486']].map(([k, v], i) => (
            <motion.div key={k} className="rounded-lg bg-zinc-50 p-2.5 dark:bg-zinc-800/60" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.7 + i * 0.1 }}>
              <p className="text-[10px] text-zinc-500">{k}</p><p className="num text-sm font-semibold">{v}</p>
            </motion.div>
          ))}
        </div>
        <div className="mt-4 flex h-28 items-end gap-1.5">
          {bars.map((h, i) => (
            <motion.div key={i} className="flex-1 rounded-t bg-gradient-to-t from-brand-600 to-brand-300" initial={{ height: 0 }} animate={{ height: `${h}%` }}
              transition={{ delay: 0.9 + i * 0.06, type: 'spring', stiffness: 140, damping: 15 }} />
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {[['Coca-Cola 1.5L', '−2', 'text-red-600'], ['Non', '+40', 'text-emerald-600'], ['Shakar 1 kg', '−0.75', 'text-red-600']].map(([n, q, c], i) => (
            <motion.div key={n} className="flex items-center justify-between rounded-lg border border-zinc-100 px-3 py-2 text-xs dark:border-zinc-800"
              initial={{ opacity: 0, x: -16 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 1.4 + i * 0.12 }}>
              <span>{n}</span><span className={cn('num font-semibold', c)}>{q}</span>
            </motion.div>
          ))}
        </div>
      </motion.div>
      <motion.div className="absolute -bottom-5 -left-4 flex items-center gap-2 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs shadow-pop dark:border-zinc-800 dark:bg-zinc-900"
        initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 1.8, type: 'spring' }}>
        <Bell className="h-4 w-4 text-amber-500" /> Telegram: kunlik hisobot ✓
      </motion.div>
    </motion.div>
  );
}

export default function LandingPage() {
  const { lang } = useI18n();
  const { isDark, toggle } = useTheme();
  const reduce = useReducedMotion();
  const x = TX[lang] || TX.uz;
  const [open, setOpen] = useState(0);
  const tg = (e) => { e.preventDefault(); openLink(SUPPORT.telegramUrl); };
  const f = reduce ? () => ({}) : fade;

  return (
    <div className="min-h-screen overflow-x-hidden bg-white text-zinc-900 dark:bg-zinc-950 dark:text-zinc-50">
      {/* nav */}
      <header className="sticky top-0 z-30 border-b border-zinc-200/70 bg-white/80 backdrop-blur-xl dark:border-zinc-800/70 dark:bg-zinc-950/80">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <a href="#features" className="ml-6 hidden text-sm font-medium text-zinc-600 hover:text-zinc-900 md:block dark:text-zinc-400 dark:hover:text-white">{x.more}</a>
          <a href="#pricing" className="hidden text-sm font-medium text-zinc-600 hover:text-zinc-900 md:block dark:text-zinc-400 dark:hover:text-white">{x.pTitle}</a>
          <div className="flex-1" />
          <LanguageSwitcher />
          <button type="button" onClick={toggle} className="btn btn-ghost btn-icon" aria-label="Theme">{isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}</button>
          <Link to="/login" className="btn btn-ghost hidden sm:inline-flex">{x.login}</Link>
          <Link to="/register" className="btn btn-primary">{x.start}</Link>
        </div>
      </header>

      {/* hero */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 opacity-[0.35] dark:opacity-[0.15]" style={{ backgroundImage: 'radial-gradient(#a7f3d0 1px, transparent 1px)', backgroundSize: '26px 26px', maskImage: 'linear-gradient(to bottom, black, transparent 85%)' }} />
        <div className="relative mx-auto grid max-w-6xl items-center gap-14 px-4 pb-20 pt-14 sm:px-6 lg:grid-cols-2 lg:pt-20">
          <div>
            <motion.span className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-3 py-1 text-xs font-semibold text-brand-700 dark:border-brand-500/30 dark:bg-brand-500/10 dark:text-brand-300" {...f(0)}>
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-brand-500" /> {x.badge}
            </motion.span>
            <motion.h1 className="mt-5 text-4xl font-bold leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl" {...f(0.08)}>
              {x.h1a}{' '}<span className="bg-gradient-to-r from-brand-600 via-emerald-500 to-teal-500 bg-clip-text text-transparent">{x.h1b}</span>
            </motion.h1>
            <motion.p className="mt-5 max-w-xl text-lg text-zinc-600 dark:text-zinc-400" {...f(0.16)}>{x.sub}</motion.p>
            <motion.div className="mt-8 flex flex-wrap gap-3" {...f(0.24)}>
              <Link to="/register" className="btn btn-primary h-12 px-6 text-base">{x.start} <ArrowRight className="h-4 w-4" /></Link>
              <Link to="/login" className="btn btn-secondary h-12 px-6 text-base">{x.login}</Link>
            </motion.div>
            <motion.p className="mt-3 text-sm text-zinc-500" {...f(0.3)}>✓ {x.trial}</motion.p>
            <motion.dl className="mt-10 grid max-w-md grid-cols-3 gap-4" {...f(0.36)}>
              {x.stats.map(([n, l]) => <div key={l}><dt className="text-2xl font-bold text-brand-600 dark:text-brand-400">{n}</dt><dd className="text-xs text-zinc-500">{l}</dd></div>)}
            </motion.dl>
          </div>
          <HeroMock />
        </div>
      </section>

      {/* features */}
      <section id="features" className="border-t border-zinc-100 bg-zinc-50/60 py-20 dark:border-zinc-900 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div className="mx-auto max-w-2xl text-center" {...f()}>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{x.fTitle}</h2>
            <p className="mt-3 text-zinc-600 dark:text-zinc-400">{x.fSub}</p>
          </motion.div>
          <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {x.features.map(([Icon, title, text], i) => (
              <motion.div key={title} className="group rounded-2xl border border-zinc-200 bg-white p-5 transition hover:-translate-y-1 hover:border-brand-300 hover:shadow-pop dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-brand-500/40" {...f((i % 4) * 0.06)}>
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-brand-50 text-brand-700 transition group-hover:scale-110 group-hover:bg-brand-600 group-hover:text-white dark:bg-brand-500/10 dark:text-brand-400"><Icon className="h-5 w-5" /></span>
                <p className="mt-4 font-semibold">{title}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* how */}
      <section className="py-20">
        <div className="mx-auto max-w-5xl px-4 sm:px-6">
          <motion.h2 className="text-center text-3xl font-bold tracking-tight sm:text-4xl" {...f()}>{x.howTitle}</motion.h2>
          <div className="mt-12 grid gap-6 md:grid-cols-3">
            {x.how.map(([title, text], i) => (
              <motion.div key={title} className="relative rounded-2xl border border-zinc-200 p-6 dark:border-zinc-800" {...f(i * 0.1)}>
                <span className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand-500 to-teal-500 text-lg font-bold text-white">{i + 1}</span>
                <p className="mt-4 text-lg font-semibold">{title}</p>
                <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">{text}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* pricing */}
      <section id="pricing" className="border-t border-zinc-100 bg-zinc-50/60 py-20 dark:border-zinc-900 dark:bg-zinc-900/30">
        <div className="mx-auto max-w-6xl px-4 sm:px-6">
          <motion.div className="text-center" {...f()}>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{x.pTitle}</h2>
            <p className="mt-3 text-zinc-600 dark:text-zinc-400">{x.pSub}</p>
          </motion.div>
          <div className="mt-12 grid gap-5 md:grid-cols-3">
            {['free', 'pro', 'max'].map((id, i) => (
              <motion.div key={id} className={cn('relative flex flex-col rounded-2xl border bg-white p-6 dark:bg-zinc-900', id === 'pro' ? 'border-brand-500 shadow-pop ring-2 ring-brand-500/20' : 'border-zinc-200 dark:border-zinc-800')} {...f(i * 0.1)}>
                {id === 'pro' && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-brand-600 px-3 py-0.5 text-xs font-semibold text-white">{x.popular}</span>}
                <p className="text-lg font-semibold capitalize">{id === 'free' ? 'Free' : id === 'pro' ? 'Pro' : 'Max'}</p>
                <p className="mt-3"><span className="num text-3xl font-bold">{formatMoney(PLANS[id].pricePerMonth)}</span> <span className="text-sm text-zinc-500">{x.perMonth}</span></p>
                <ul className="mt-6 flex-1 space-y-2.5 text-sm">
                  {x.plans[id].map((line) => <li key={line} className="flex gap-2"><Check className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" /> {line}</li>)}
                </ul>
                <Link to="/register" className={cn('btn mt-6 w-full', id === 'pro' ? 'btn-primary' : 'btn-secondary')}>{x.choose}</Link>
              </motion.div>
            ))}
          </div>
          <motion.div className="mt-10 flex flex-col items-center gap-4 rounded-2xl bg-gradient-to-r from-brand-600 via-emerald-600 to-teal-600 p-6 text-white sm:flex-row sm:p-8" {...f()}>
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-white/15"><Gift className="h-7 w-7" /></span>
            <div className="flex-1 text-center sm:text-left">
              <p className="text-lg font-semibold">{x.bTitle}</p>
              <p className="mt-1 text-sm text-white/85">{x.bText}</p>
            </div>
            <Link to="/register" className="btn bg-white text-brand-700 hover:bg-brand-50">{x.start}</Link>
          </motion.div>
        </div>
      </section>

      {/* faq */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <motion.h2 className="text-center text-3xl font-bold tracking-tight" {...f()}>{x.qTitle}</motion.h2>
          <div className="mt-10 divide-y divide-zinc-200 rounded-2xl border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
            {x.faq.map(([q, a], i) => (
              <div key={q}>
                <button type="button" onClick={() => setOpen(open === i ? -1 : i)} className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left font-medium" aria-expanded={open === i}>
                  {q}<ChevronDown className={cn('h-4 w-4 shrink-0 transition', open === i && 'rotate-180')} />
                </button>
                <motion.div initial={false} animate={{ height: open === i ? 'auto' : 0, opacity: open === i ? 1 : 0 }} className="overflow-hidden">
                  <p className="px-5 pb-4 text-sm text-zinc-600 dark:text-zinc-400">{a}</p>
                </motion.div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* cta + footer */}
      <section className="px-4 pb-16 sm:px-6">
        <motion.div className="relative mx-auto max-w-5xl overflow-hidden rounded-3xl bg-zinc-950 px-6 py-14 text-center text-white" {...f()}>
          <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="pointer-events-none absolute -bottom-24 -left-10 h-72 w-72 rounded-full bg-teal-500/20 blur-3xl" />
          <h2 className="relative text-3xl font-bold tracking-tight">{x.cta}</h2>
          <div className="relative mt-8 flex flex-wrap justify-center gap-3">
            <Link to="/register" className="btn btn-primary h-12 px-6 text-base">{x.start} <ArrowRight className="h-4 w-4" /></Link>
            <a href={SUPPORT.telegramUrl} onClick={tg} className="btn h-12 border border-white/20 bg-white/5 px-6 text-base text-white hover:bg-white/10"><Send className="h-4 w-4" /> @{SUPPORT.telegram}</a>
          </div>
        </motion.div>
      </section>
      <footer className="border-t border-zinc-200 py-8 text-sm text-zinc-500 dark:border-zinc-800">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3"><Logo /><span>© {new Date().getFullYear()}</span></div>
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5"><Headphones className="h-4 w-4" /> {x.support}:</span>
            <a href={SUPPORT.telegramUrl} onClick={tg} className="flex items-center gap-1.5 text-sky-600 hover:underline"><Send className="h-4 w-4" /> @{SUPPORT.telegram}</a>
            <a href={SUPPORT.phoneHref} className="num flex items-center gap-1.5 hover:underline"><Phone className="h-4 w-4" /> {SUPPORT.phone}</a>
            <span className="hidden items-center gap-1.5 sm:flex"><Printer className="h-4 w-4" /> 58/80 mm</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
