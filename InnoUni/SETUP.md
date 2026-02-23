# Inno Uni - Ro'yxatdan o'tish tizimi

## 🚀 Tezkor o'rnatish

### 1. Backend serverini ishga tushirish

```bash
# Backend papkasiga o'ting
cd "c:/Users/Sunnatjon/Desktop/Open university/backend"

# Package larni o'rnating (agar o'rnatilmagan bo'lsa)
npm install

# Serverni ishga tushiring
npm start
# yoki development rejimda
npm run dev
```

### 2. Email sozlamalari (Contact form uchun)

Gmail orqali email yuborish uchun:

1. Google Account → Security → 2-Step Verification yoqing
2. App passwords → Create new app password
3. `.env` faylga `EMAIL_PASS` ni kiriting:
```env
EMAIL_USER=ulashevsunnat200@gmail.com
EMAIL_PASS=your-gmail-app-password
```

### 3. Ma'lumotlar bazasi

MySQL o'rnatilgan bo'lishi kerak:
```bash
# Database yaratish
mysql -u root -p
CREATE DATABASE oqiv_platform;
```

## 📋 Ro'yxatdan o'tish jarayoni

### Talaba uchun:
1. Asosiy sahifada "Boshlash" tugmasini bosing
2. "Ro'yxatdan o'tish" havolasini tanlang
3. Formani to'ldiring:
   - Ism familiya
   - Email
   - Telefon
   - Parol
4. "Ro'yxatdan o'tish" tugmasini bosing

### O'qituvchi uchun:
1. Role tanlashda "O'qituvchi" ni tanlang
2. Formani to'ldiring
3. Ro'yxatdan o'ting

## 🔐 Tizim imkoniyatlari

- **Role-based access** - Talaba va o'qituvchi uchun alohida interfeys
- **JWT Authentication** - Xavfsiz kirish tizimi
- **Email notifications** - Contact form orqali xabarlar
- **Responsive design** - Mobil qurilmalarda ishlashi
- **Data validation** - Form validatsiyasi

## 🛠️ API endpoint lar

- `POST http://localhost:3000/api/auth/register` - Ro'yxatdan o'tish
- `POST http://localhost:3000/api/auth/login` - Tizimga kirish
- `POST http://localhost:3000/api/contact` - Contact form

## 📱 Test qilish

1. Browserda `index.html` ni oching
2. "Boshlash" tugmasini bosing
3. Ro'yxatdan o'tishni sinab ko'ring
4. Login qilib, dashboardga o'ting

## 🔧 Muammolar va yechimlari

### "Server not found" xatosi:
- Backend server ishga tushirilganligini tekshiring (port 3000)
- Firewall bloklamaganligini tekshiring

### "Email not sent" xatosi:
- Gmail 2-Step verification yoqilganligini tekshiring
- App password to'g'ri kiritilganligini tekshiring

### "Database connection" xatosi:
- MySQL server ishlayotganligini tekshiring
- .env fayldagi ma'lumotlar to'g'riligini tekshiring
