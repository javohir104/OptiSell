# OptiSell — qanday ishga tushiriladi

Loyiha 3 qismdan iborat:

| Papka | Nima | Port |
|---|---|---|
| `backend/` | API (Node.js + Express). Ma'lumotlar `backend/data/*.json` fayllarida | 5000 |
| `frontend/` | Sayt (React + Vite) | 5173 |
| `telegram-bot/` | Saytni Telegram Mini App sifatida ochadigan bot (ixtiyoriy) | — |

Ma'lumotlar bazasi (PostgreSQL, Supabase, MongoDB) **kerak emas**. Hammasi JSON fayllarda saqlanadi.

---

## 1. Kerakli dastur

- **Node.js 22** yoki undan yangi: https://nodejs.org (tekshirish: `node -v`)

## 2. Birinchi marta o'rnatish

```bash
cd backend
npm install
cd ../frontend
npm install
```

`backend/.env` fayli bo'lishi kerak. Agar yo'q bo'lsa, `backend/.env.example` dan nusxa oling va
`JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` ni to'ldiring.

## 3. Ishga tushirish (bitta buyruq)

Loyiha papkasida (`OptiSell/`):

```bash
node start-local.mjs
```

Bu buyruq backendni (:5000) va frontendni (:5173) yoqadi.
Brauzerda oching: **http://localhost:5173**

To'xtatish: `Ctrl + C`.

Telegram bot bilan birga: `node start-local.mjs --telegram`

### Alohida-alohida ishga tushirish (ikkita terminal)

```bash
# 1-terminal
cd backend
npm run dev

# 2-terminal
cd frontend
npm run dev
```

---

## 4. Akkauntlar

| Kim | Qayerga kiradi | Email | Parol |
|---|---|---|---|
| **Admin** | http://localhost:5173/login (keyin menyuda "Admin panel") | `akmalovj54@gmail.com` | `198019862012` |

- Admin akkaunti `backend/.env` dagi `ADMIN_EMAIL` va `ADMIN_PASSWORD` dan olinadi. Backend har safar
  yoqilganda shu email bilan admin yaratiladi yoki uning paroli yangilanadi. Parolni o'zgartirish uchun
  `.env` ni tahrirlab, backendni qayta yoqing.
- Ikki xil rol bor: `user` (hamma yangi ro'yxatdan o'tganlar) va `admin`. Admin ham oddiy
  `/login` sahifasidan kiradi, o'z dashboardini ko'radi va menyuda qo'shimcha **"Admin panel"** bo'limi
  chiqadi. Oddiy userga bu bo'lim ko'rinmaydi, `/admin` ni ochsa dashboardga qaytariladi, `/api/admin/*`
  so'rovlariga esa backend **403** qaytaradi (rol har so'rovda bazadan tekshiriladi).
- Admin panelda barcha foydalanuvchilar ro'yxati, ularning tarifi, oxirgi faolligi, to'lovlari,
  saytga tashriflar va audit jurnali ko'rinadi.
- Yangi foydalanuvchi http://localhost:5173/register orqali ro'yxatdan o'tadi (birinchi oy Pro tekin).

Admin huquqini boshqa foydalanuvchiga berish (backend o'chiq holatda):

```bash
cd backend
npm run admin -- list
npm run admin -- grant  email@misol.uz
npm run admin -- revoke email@misol.uz
```

> ⚠️ Bu faylda admin paroli yozilgan. Loyihani ochiq (public) GitHub'ga yuklasangiz, avval parolni
> `backend/.env` da o'zgartiring va bu jadvaldan olib tashlang.

---

## 5. Ma'lumotlar qayerda saqlanadi

`backend/data/` papkasida, har bir jadval alohida faylda:

```
users.json              foydalanuvchilar
products.json           mahsulotlar va ombordagi qoldiq
sales.json              savdolar
expenses.json           xarajatlar
inventory_movements.json ombor harakati tarixi
imports.json            Excel/CSV import tarixi
payments.json           to'lovlar
page_views.json         sayt tashriflari (admin statistikasi uchun)
admin_audit_log.json    admin amallari jurnali
```

- Har bir o'zgarish (yangi user, mahsulot, savdo...) **darhol** faylga yoziladi. Kompyuterni yoki
  serverni o'chirib-yoqsangiz ham hech narsa yo'qolmaydi.
- **Zaxira nusxa (backup):** `backend/data` papkasini nusxalab qo'ying.
- **Hammasini tozalash:** backendni to'xtating va `backend/data` papkasini o'chiring.
- Boshqa papkadan foydalanish: `backend/.env` da `DATA_DIR=...` yozing.

---

## 6. Savdo prognozi (menyuda "Savdo prognozi")

Keyingi 7 / 14 / 30 kunda qancha sotilishini hisoblaydi va qaysi mahsulotdan qancha buyurtma qilish
kerakligini ko'rsatadi. Bu sun'iy intellekt emas: o'tgan savdolar bo'yicha oddiy statistika
(oxirgi 14 kunlik o'rtacha, trend va hafta kunlari bo'yicha farq).

Ikki xil manba:
1. **Do'konim savdolari**: OptiSell'ga kiritilgan oxirgi 90 kunlik savdo va joriy qoldiq.
2. **Excel / CSV fayl**: `.xlsx` yoki `.csv` faylni yuklang. Ustunlar:

| date | product | quantity | price (ixtiyoriy) |
|---|---|---|---|
| 2026-11-01 | Non | 12 | 4000 |

Ustun nomlari o'zbekcha ham bo'lishi mumkin: `sana`, `mahsulot`, `soni`, `narx`. Sana
`2026-11-01` yoki `01.11.2026` ko'rinishida bo'lishi mumkin. Sahifada "Namuna faylni yuklab olish"
tugmasi bor.

## 7. Mahsulot va savdolarni Excel'dan import qilish (menyuda "Import")

- **Mahsulotlar:** `name, category, price, cost, stock` (+ ixtiyoriy `sku, minStock, maxStock, unit, description`)
- **Savdolar:** `sku, quantity` (+ ixtiyoriy `unitPrice, date, customer, paymentMethod`)

---

## 8. Testlar

```bash
cd backend
npm test
```

Testlar ma'lumotlarni faqat xotirada saqlaydi, `backend/data` ga tegmaydi.

## 9. Telegram bot

`telegram-bot/.env` ga `BOT_TOKEN` (@BotFather'dan) yozing, keyin:

```bash
cd telegram-bot
npm run local   # frontend va backend yoqilgan bo'lishi kerak
```

## 10. Google orqali kirish

1. https://console.cloud.google.com/apis/credentials → **Create credentials → OAuth client ID** →
   turi **Web application**. (Birinchi marta so'rasa, "OAuth consent screen" ni to'ldiring.)
2. **Authorized JavaScript origins** ga saytingiz manzillarini qo'shing:
   `http://localhost:5173` va production domen (masalan `https://sizning-sayt.vercel.app`).
   Redirect URI kerak emas.
3. Olingan Client ID (`...apps.googleusercontent.com`) ni ikki joyga yozing:
   - `backend/.env`: `GOOGLE_CLIENT_ID=...`
   - `frontend/.env`: `VITE_GOOGLE_CLIENT_ID=...` (Vercel'da ham Environment Variables ga qo'shing)
4. Backend va frontendni qayta yoqing. Login va ro'yxatdan o'tish sahifalarida "Google" tugmasi chiqadi.

- Yangi Google user oddiy `user` rolida yaratiladi (1 oy Pro tekin). Google orqali admin bo'lib bo'lmaydi.
- Shu email bilan parolli akkaunt bo'lsa, Google unga ulanadi, parol bilan kirish ham ishlayveradi.
- Telegram ichida Google tugmasi telefon brauzerini ochadi: u yerda Google orqali kirasiz, Telegram'ga qaytganda avtomatik kirgan bo'lasiz. Buning uchun saytning HTTPS manzili Google Console'da **Authorized JavaScript origins** ga qo'shilgan bo'lishi kerak (vaqtinchalik trycloudflare manzili ishlamaydi).

## 11. Muammolar

| Muammo | Yechim |
|---|---|
| `Port 5000 is already in use` | Backend boshqa oynada ochiq. O'sha oynani yoping. |
| Login qilganda "server bilan aloqa yo'q" | Backend ishlamayapti: `cd backend && npm run dev` |
| Admin panelga kirolmayapman | `backend/.env` da `ADMIN_EMAIL` / `ADMIN_PASSWORD` ni tekshiring va backendni qayta yoqing |
| `.xls` fayl o'qilmaydi | Excel'da "Saqlash → Excel Workbook (.xlsx)" yoki CSV qilib saqlang |

---

## Yangi imkoniyatlar (2026-11)

| Imkoniyat | Tarif | Qayerda |
|---|---|---|
| Sotuvni qaytarish / bekor qilish | hammasi | Sotuvlar → sotuvni oching → «Qaytarish» |
| Shtrix-kod (kamera yoki USB skaner) | hammasi | Yangi sotuv oynasi, mahsulot formasi |
| Chek (58/80 mm printer) | hammasi | Sotuvdan keyin avtomatik, yoki sotuv → «Chek» |
| Chegirma (% yoki summa) | hammasi | Yangi sotuv oynasi |
| Oflayn rejim | hammasi | Internet yo'q bo'lsa sotuv qurilmada saqlanadi, keyin yuboriladi |
| Xarajatlar, Tahlil | **Pro+** | Free'da yopiq |
| Nasiya (qarz daftari) | **Pro+** | Menyu → Nasiya |
| Yetkazib beruvchilar va kirim | **Pro+** | Menyu → Yetkazib beruvchilar |
| Sotuvchi akkauntlari (10 tagacha) | **Max** | Menyu → Sotuvchilar |
| Telegram kunlik hisobot va ogohlantirish | **Max** | Profil → Telegram |
| Do'kon joylashuvi (ro'yxatdan o'tgach majburiy) | hammasi | Birinchi kirishda oyna chiqadi; keyin Profil → Do'kon joylashuvi |
| Do'konlar xaritasi | hammasi | Menyu → Do'konlar xaritasi (`/shops`) |

**Backup:** har kuni avtomatik `backend/data/backups/` ga saqlanadi (oxirgi 14 tasi). Fayl buzilsa,
server ishga tushganda o'zi tiklaydi. Qo'lda tiklash: serverni to'xtating, backup papkasidagi
fayllarni `backend/data/` ga nusxalang, qayta ishga tushiring. Admin panel → Backup bo'limida yuklab olish ham bor.

**Telegram xabarnomalari** uchun `backend/.env` ga:
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_LINK_SECRET` ni yozing; `telegram-bot/.env` ga esa
`BACKEND_URL` va o'sha `TELEGRAM_LINK_SECRET` ni yozing.

**Support:** Telegram @Opti_Sellsupport · +998 (95) 812 50 12

### Bonus ballar
| Nima uchun | Ball |
|---|---|
| Taklif qilingan do'st haqiqiy do'kon ochdi (do'kon nomi + 5 mahsulot + 3 sotuv) | +15 |
| Do'st Pro sotib oldi (har to'lovda) | +30 |
| Do'st Max sotib oldi (har to'lovda) | +50 |
| O'zingiz Pro sotib oldingiz (har to'lovda, ballar bilan emas) | +30 |
| O'zingiz Max sotib oldingiz (har to'lovda, ballar bilan emas) | +50 |
| Kunlik tushum 1 500 000 so'mdan oshdi (kun tugagach, qaytarishlarsiz) | +10 |

399 ball = 1 oy Pro, 699 ball = 1 oy Max. Qoidalar: `backend/src/config/bonus.js`.

### Boshqa yangi sahifalar
- `/forgot-password` — parolni Telegram'ga kelgan kod bilan tiklash. Telegram ulanmagan bo'lsa:
  Admin panel → Foydalanuvchilar → "Parol tiklash havolasi" (24 soat amal qiladi).
- `/inventory/count` — inventarizatsiya, `/labels` — shtrix-kodli etiketkalar, `/reports` — Excel hisobotlar.
- Ombor sahifasida "Nima buyurtma qilish kerak" tavsiyasi; kg / l / m da kasr miqdor bilan sotish.
- Kirmagan foydalanuvchilar uchun `/` — landing sahifa.

---

## ⚠️ Render'da ma'lumot o'chib ketmasligi uchun (MUHIM)

Render'ning bepul serverida disk **har deploy'da tozalanadi**. Shuning uchun `backend/data/*.json`
fayllar (foydalanuvchilar, sotuvlar...) har push'dan keyin yo'qolardi. Endi backend ma'lumotlarni
**PostgreSQL** bazada saqlay oladi — u Render serveridan tashqarida turadi va hech qachon tozalanmaydi.

1. Bepul Postgres oching: **https://neon.tech** (yoki supabase.com) → yangi loyiha → **Connection string**
   ni nusxalang (`postgresql://...` bilan boshlanadi).
2. Render → backend servisi → **Environment** → `DATABASE_URL` = o'sha qator → **Save**.
3. **Manual Deploy**. Logda `Storage: PostgreSQL (... rows loaded)` chiqsa — tayyor.
   `https://<backend>/api/health` da `"storage":"postgres"` ko'rinadi.

Shundan keyin push / redeploy qilsangiz ham foydalanuvchilar va hamma ma'lumot joyida qoladi.

Kompyuteringizdagi ma'lumotlarni (backend/data) shu bazaga ko'chirish (bir marta):
```bash
cd backend
DATABASE_URL="postgresql://..." npm run db:push
```
(Baza bo'sh bo'lmasa hech narsa o'zgartirmaydi; ustidan yozish uchun `-- --force`.)
