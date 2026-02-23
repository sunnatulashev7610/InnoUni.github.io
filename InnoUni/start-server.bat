@echo off
echo Inno Uni Backend Server ishga tushirilmoqda...
echo.

cd /d "c:\Users\Sunnatjon\Desktop\Open university\backend"

echo Package larni tekshiramiz...
if not exist node_modules (
    echo Package larni o'rnatamiz...
    npm install
)

echo Server ishga tushirilmoqda...
echo Server: http://localhost:3000
echo To'xtatish uchun: Ctrl+C
echo.

npm start

pause
