# TestDemo OLED hello (MicroPython)

Firmware de test pour **Waveshare Pico-OLED-1.3** (SH1107, 128×64, SPI).

## Prérequis

1. Pico déjà sous MicroPython
2. Module Pico-OLED-1.3 enfiché (pinout HAT Waveshare)

## Pinout

| Signal | GPIO |
|--------|------|
| DIN / MOSI | GP11 |
| CLK / SCK | GP10 |
| CS | GP9 |
| DC | GP8 |
| RST | GP12 |

## Contenu poussé

- `main.py` — logo Cleep + « Hello World »
- `sh1107.py` — driver SPI (échantillon Waveshare)
- `cleep_logo.py` — logo 40×40 1 bit (`MONO_HMSB`)

Flasher via CleepDesktop → Flash Pico → wizard MicroPython.
