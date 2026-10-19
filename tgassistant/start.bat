@echo off
cd /d "%~dp0"
if not exist venv (
  python -m venv venv
  call venv\Scripts\activate
  pip install -r requirements.txt
) else (
  call venv\Scripts\activate
)
:loop
python main.py
echo Бот остановился, перезапуск через 5 секунд...
timeout /t 5 >nul
goto loop
