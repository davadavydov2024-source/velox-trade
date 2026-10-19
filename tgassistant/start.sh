#!/usr/bin/env bash
# Запуск одной командой: ./start.sh  (Linux / Mac / Termux)
cd "$(dirname "$0")"
[ -d venv ] || { python3 -m venv venv && . venv/bin/activate && pip install -r requirements.txt; }
. venv/bin/activate
while true; do python main.py; echo "Бот остановился, перезапуск через 5 с..."; sleep 5; done
