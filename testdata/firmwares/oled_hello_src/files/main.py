"""Cleep OLED hello — Waveshare Pico-OLED-1.3."""
import time
from sh1107 import PicoOled13
import cleep_logo


def blit_logo(oled, x, y):
    data = cleep_logo.DATA
    row_bytes = (cleep_logo.WIDTH + 7) // 8
    for row in range(cleep_logo.HEIGHT):
        for xb in range(row_bytes):
            byte = data[row * row_bytes + xb]
            for bit in range(8):
                col = xb * 8 + bit
                if col >= cleep_logo.WIDTH:
                    break
                if byte & (0x80 >> bit):
                    oled.pixel(x + col, y + row, 1)


def main():
    oled = PicoOled13()
    oled.fill(0)
    oled.rect(0, 0, oled.width, oled.height, 1)

    logo_x = 4
    logo_y = (oled.height - cleep_logo.HEIGHT) // 2
    blit_logo(oled, logo_x, logo_y)

    text_x = logo_x + cleep_logo.WIDTH + 8
    oled.text("Hello", text_x, 20, 1)
    oled.text("Cleep", text_x, 36, 1)
    oled.show()

    while True:
        time.sleep(1)


if __name__ == "__main__":
    main()
